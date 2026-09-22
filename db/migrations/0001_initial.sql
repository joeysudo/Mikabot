CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, label TEXT NOT NULL, remote_id TEXT NOT NULL, secret TEXT NOT NULL, expires_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 0);

CREATE INDEX IF NOT EXISTS idx_accounts_platform_active ON accounts(platform,active);

CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, provider TEXT NOT NULL, verifier TEXT NOT NULL, session_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, platform TEXT NOT NULL, revision INTEGER NOT NULL, status TEXT NOT NULL, remote_id TEXT, error TEXT, created_at TEXT NOT NULL, UNIQUE(post_id,platform,revision));

CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, message TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS login_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS agent_policies (account_key TEXT PRIMARY KEY, data TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS agent_faqs (id TEXT PRIMARY KEY, data TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS agent_messages (id TEXT PRIMARY KEY, account_key TEXT NOT NULL, thread_id TEXT NOT NULL, data TEXT NOT NULL, occurred_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS idx_agent_messages_thread ON agent_messages(account_key,thread_id,occurred_at);

CREATE TABLE IF NOT EXISTS agent_items (id TEXT PRIMARY KEY, message_id TEXT NOT NULL UNIQUE, account_key TEXT NOT NULL, thread_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, status TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS agent_suppressions (account_key TEXT NOT NULL, thread_id TEXT NOT NULL, PRIMARY KEY(account_key,thread_id));

CREATE TABLE IF NOT EXISTS agent_locks (key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS agent_deliveries (item_id TEXT PRIMARY KEY, account_key TEXT NOT NULL, thread_id TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS idx_agent_deliveries_account_date ON agent_deliveries(account_key,created_at);

CREATE TABLE IF NOT EXISTS agent_offsets (key TEXT PRIMARY KEY, value TEXT NOT NULL);
