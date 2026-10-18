CREATE TABLE presentations (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  include_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
--> statement-breakpoint
CREATE TABLE responses (
  round_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  question_key TEXT NOT NULL,
  source TEXT NOT NULL,
  demo_batch_id TEXT,
  payload TEXT NOT NULL,
  public_payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (round_id, session_id)
);
--> statement-breakpoint
CREATE INDEX responses_recent ON responses(round_id,question_key,created_at DESC,session_id);
