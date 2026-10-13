-- Add parent_session_id column to acp_sessions for tracking child (CRAFTER/GATE) session hierarchy
ALTER TABLE "acp_sessions" ADD COLUMN "parent_session_id" text;
