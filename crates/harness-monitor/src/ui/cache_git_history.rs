use super::{
    facts_cache_key, git_file_change_count, send_background_result, BackgroundResult, PendingFacts,
};
use std::sync::mpsc::{Receiver, Sender};

#[derive(Debug)]
pub(super) enum GitHistoryCommand {
    LoadCount {
        repo_root: String,
        rel_path: String,
        version: i64,
        entry_kind: crate::shared::models::EntryKind,
    },
}

#[derive(Debug, Default)]
struct PendingGitHistoryCommands {
    count: Option<PendingFacts>,
}

pub(super) fn git_history_worker(
    rx: Receiver<GitHistoryCommand>,
    tx: Sender<BackgroundResult>,
    result_signal_tx: Sender<()>,
) {
    while let Ok(command) = rx.recv() {
        let mut pending = PendingGitHistoryCommands::default();
        queue_git_history_command(&mut pending, command);
        while let Ok(next) = rx.try_recv() {
            queue_git_history_command(&mut pending, next);
        }
        if let Some((repo_root, rel_path, version, entry_kind)) = pending.count.take() {
            send_background_result(
                &tx,
                &result_signal_tx,
                BackgroundResult::GitHistoryCount {
                    key: facts_cache_key(&rel_path, version, entry_kind),
                    count: git_file_change_count(&repo_root, &rel_path),
                },
            );
        }
    }
}

fn queue_git_history_command(pending: &mut PendingGitHistoryCommands, command: GitHistoryCommand) {
    match command {
        GitHistoryCommand::LoadCount {
            repo_root,
            rel_path,
            version,
            entry_kind,
        } => {
            pending.count = Some((repo_root, rel_path, version, entry_kind));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{git_history_worker, GitHistoryCommand};
    use crate::shared::models::EntryKind;
    use crate::ui::tui::cache::{facts_cache_key, BackgroundResult};
    use std::process::Command;
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;
    use tempfile::tempdir;

    #[test]
    fn git_history_worker_coalesces_to_latest_request() {
        let dir = tempdir().expect("tempdir");
        let repo_root = dir.path().to_string_lossy().to_string();

        let init = Command::new("git")
            .args(["init", "--no-bare"])
            .arg(dir.path())
            .output()
            .expect("init repo");
        assert!(init.status.success(), "git init failed: {init:?}");

        let config_name = Command::new("git")
            .arg("-C")
            .arg(dir.path())
            .args(["config", "user.name", "Codex"])
            .output()
            .expect("set git user.name");
        assert!(
            config_name.status.success(),
            "git config user.name failed: {config_name:?}"
        );

        let config_email = Command::new("git")
            .arg("-C")
            .arg(dir.path())
            .args(["config", "user.email", "codex@example.com"])
            .output()
            .expect("set git user.email");
        assert!(
            config_email.status.success(),
            "git config user.email failed: {config_email:?}"
        );

        std::fs::write(dir.path().join("a.rs"), "fn a() {}\n").expect("write a.rs");
        std::fs::write(dir.path().join("b.rs"), "fn b() {}\n").expect("write b.rs");

        let add = Command::new("git")
            .arg("-C")
            .arg(dir.path())
            .args(["add", "."])
            .output()
            .expect("git add");
        assert!(add.status.success(), "git add failed: {add:?}");

        let commit = Command::new("git")
            .arg("-C")
            .arg(dir.path())
            .args(["commit", "-m", "seed"])
            .output()
            .expect("git commit");
        assert!(commit.status.success(), "git commit failed: {commit:?}");

        let (command_tx, command_rx) = mpsc::channel();
        let (result_tx, result_rx) = mpsc::channel();
        let (signal_tx, _signal_rx) = mpsc::channel();

        let handle = thread::spawn(move || {
            git_history_worker(command_rx, result_tx, signal_tx);
        });

        command_tx
            .send(GitHistoryCommand::LoadCount {
                repo_root: repo_root.clone(),
                rel_path: "a.rs".to_string(),
                version: 1,
                entry_kind: EntryKind::File,
            })
            .expect("queue a.rs history");
        command_tx
            .send(GitHistoryCommand::LoadCount {
                repo_root,
                rel_path: "b.rs".to_string(),
                version: 1,
                entry_kind: EntryKind::File,
            })
            .expect("queue b.rs history");
        drop(command_tx);

        let result = result_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("receive git history result");
        match result {
            BackgroundResult::GitHistoryCount { key, count } => {
                assert_eq!(key, facts_cache_key("b.rs", 1, EntryKind::File));
                assert_eq!(count, Some(1));
            }
            other => panic!("unexpected background result: {other:?}"),
        }
        assert!(result_rx.try_recv().is_err());

        handle.join().expect("join git history worker");
    }
}
