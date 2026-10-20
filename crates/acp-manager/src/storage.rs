//! Internal trace storage path utilities, copied from routa-core.

use std::path::PathBuf;

pub fn to_folder_slug(absolute_path: &str) -> String {
    // Strip leading separators
    let cleaned = absolute_path.trim_start_matches(['/', '\\']);
    // Strip trailing separators (avoids trailing hyphen in slug)
    let cleaned = cleaned.trim_end_matches(['/', '\\']);
    // Replace consecutive separators with a single hyphen
    let mut result = String::with_capacity(cleaned.len());
    let mut last_was_sep = false;
    for c in cleaned.chars() {
        if c == ':' {
            // Skip colons (Windows drive letters like C: or E:)
            continue;
        }
        if c == '/' || c == '\\' {
            if !last_was_sep {
                result.push('-');
            }
            last_was_sep = true;
        } else {
            result.push(c);
            last_was_sep = false;
        }
    }
    result
}

/// Get the base storage directory for a project.
///
/// Returns `~/.routa/projects/{folder-slug}`
pub fn get_project_storage_dir(absolute_path: &str) -> PathBuf {
    let slug = to_folder_slug(absolute_path);
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("~"));
    home.join(".routa").join("projects").join(slug)
}

/// Get the traces directory for a project.
///
/// Returns `~/.routa/projects/{folder-slug}/traces`
pub fn get_traces_dir(absolute_path: &str) -> PathBuf {
    get_project_storage_dir(absolute_path).join("traces")
}
