-- Add codebase association and worktree fields to tasks table
ALTER TABLE `tasks` ADD `codebase_ids` text DEFAULT '[]';
ALTER TABLE `tasks` ADD `worktree_id` text;
