-- Add session_ids column to track historical session associations
ALTER TABLE `tasks` ADD `session_ids` text DEFAULT '[]';
