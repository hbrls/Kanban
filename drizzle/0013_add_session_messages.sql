-- Split messageHistory JSONB array from acp_sessions into independent session_messages table
-- Each message is stored as a separate row for better query performance and pagination

CREATE TABLE IF NOT EXISTS "session_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL REFERENCES "acp_sessions"("id") ON DELETE CASCADE,
  "message_index" integer NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for fast session history lookups (ordered by message_index)
CREATE INDEX IF NOT EXISTS "idx_session_messages_session_id" ON "session_messages" ("session_id", "message_index");

-- Index on traces.timestamp for date-range queries
CREATE INDEX IF NOT EXISTS "idx_traces_timestamp" ON "traces" ("timestamp");
