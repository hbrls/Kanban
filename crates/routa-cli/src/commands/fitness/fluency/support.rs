use regex::RegexBuilder;

use super::types::{LevelChange, MAX_REGEX_PATTERN_LENGTH};

pub(super) fn build_regex(pattern: &str, flags: &str, label: &str) -> Result<regex::Regex, String> {
    if pattern.len() > MAX_REGEX_PATTERN_LENGTH {
        return Err(format!(
            "{label}.pattern exceeds max length {MAX_REGEX_PATTERN_LENGTH}"
        ));
    }

    let mut builder = RegexBuilder::new(pattern);
    for flag in flags.chars() {
        match flag {
            'i' => {
                builder.case_insensitive(true);
            }
            'm' => {
                builder.multi_line(true);
            }
            's' => {
                builder.dot_matches_new_line(true);
            }
            'U' => {
                builder.swap_greed(true);
            }
            'u' => {
                builder.unicode(true);
            }
            'x' => {
                builder.ignore_whitespace(true);
            }
            'R' => {
                builder.crlf(true);
            }
            _ => {
                return Err(format!(
                    "{label} has invalid regex settings: unsupported flag '{flag}'"
                ));
            }
        }
    }

    builder
        .build()
        .map_err(|error| format!("{label} has invalid regex settings: {error}"))
}

pub(super) fn format_percent(value: Option<f64>) -> String {
    match value {
        Some(value) => format!("{}%", (value * 100.0).round() as i64),
        None => "n/a".to_string(),
    }
}

pub(super) fn level_change_label(change: &LevelChange) -> &'static str {
    match change {
        LevelChange::Same => "same",
        LevelChange::Up => "up",
        LevelChange::Down => "down",
    }
}
