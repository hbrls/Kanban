CREATE TABLE IF NOT EXISTS `session_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL REFERENCES `acp_sessions`(`id`) ON DELETE CASCADE,
  `message_index` integer NOT NULL,
  `event_type` text NOT NULL,
  `payload` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS `idx_session_messages_session_id`
ON `session_messages` (`session_id`, `message_index`);
