use std::collections::BTreeSet;
use std::path::Path;

pub(crate) fn parse_env_file(path: &Path) -> Result<Vec<(String, String)>, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|err| format!("Failed to read env file '{}': {}", path.display(), err))?;
    parse_env_content(&raw, path)
}

pub(crate) fn parse_env_file_keys(path: &Path) -> Result<Vec<String>, String> {
    parse_env_file(path).map(|pairs| {
        pairs
            .into_iter()
            .map(|(key, _)| key)
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect()
    })
}

fn parse_env_content(raw: &str, path: &Path) -> Result<Vec<(String, String)>, String> {
    let mut pairs = Vec::new();

    for (index, line) in raw.lines().enumerate() {
        let mut line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if let Some(stripped) = line.strip_prefix("export ") {
            line = stripped.trim();
        }

        let Some((key, value)) = line.split_once('=') else {
            return Err(format!(
                "Invalid env file entry in '{}', line {}: expected KEY=VALUE",
                path.display(),
                index + 1
            ));
        };

        let key = key.trim();
        if key.is_empty() {
            return Err(format!(
                "Invalid env file entry in '{}', line {}: key cannot be empty",
                path.display(),
                index + 1
            ));
        }

        let value = strip_matching_quotes(value.trim()).to_string();
        pairs.push((key.to_string(), value));
    }

    Ok(pairs)
}

fn strip_matching_quotes(value: &str) -> &str {
    if value.len() >= 2 {
        let quoted = (value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\''));
        if quoted {
            return &value[1..value.len() - 1];
        }
    }

    value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_env_file_supports_export_quotes_and_comments() {
        let dir = tempfile::tempdir().expect("tempdir should exist");
        let path = dir.path().join(".env");
        std::fs::write(
            &path,
            r#"
                # comment
                export OPENAI_API_KEY="sk-test"
                FOO=bar=baz
                EMPTY=
            "#,
        )
        .expect("env file should be written");

        let pairs = parse_env_file(&path).expect("env file should parse");
        assert_eq!(
            pairs,
            vec![
                ("OPENAI_API_KEY".to_string(), "sk-test".to_string()),
                ("FOO".to_string(), "bar=baz".to_string()),
                ("EMPTY".to_string(), "".to_string()),
            ]
        );
    }

    #[test]
    fn parse_env_file_rejects_invalid_entries() {
        let dir = tempfile::tempdir().expect("tempdir should exist");
        let path = dir.path().join(".env");
        std::fs::write(&path, "NOT_VALID").expect("env file should be written");

        let err = parse_env_file(&path).expect_err("invalid env file should fail");
        assert!(err.contains("expected KEY=VALUE"));
    }
}
