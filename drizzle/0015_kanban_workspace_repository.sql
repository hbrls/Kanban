-- Kanban Workspace Repository: add codebase_ids and worktree_id to tasks
ALTER TABLE "tasks" ADD COLUMN "codebase_ids" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "tasks" ADD COLUMN "worktree_id" TEXT;
