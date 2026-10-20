//! Internal Git command construction, copied from routa-core.

#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::Command;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn git_command() -> Command {
    #[cfg(windows)]
    {
        let mut command = Command::new("git");
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }
    #[cfg(not(windows))]
    {
        Command::new("git")
    }
}
