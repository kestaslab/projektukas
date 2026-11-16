PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topic_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  group_id INTEGER NOT NULL REFERENCES topic_groups(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  short_description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS theory_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  short_description TEXT,
  content_markdown TEXT NOT NULL,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  short_description TEXT,
  difficulty INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  statement TEXT NOT NULL,
  input_desc TEXT,
  output_desc TEXT,
  examples TEXT,
  teacher_notes TEXT,
  external_url TEXT,
  hint TEXT,
  tags TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS theory_task_links (
  theory_id INTEGER NOT NULL REFERENCES theory_pages(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (theory_id, task_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  linked_type TEXT NOT NULL CHECK (linked_type IN ('theory', 'task')),
  linked_id INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_topic_groups_sort ON topic_groups(sort_order, title);
CREATE INDEX IF NOT EXISTS idx_topics_group_sort ON topics(group_id, sort_order, title);
CREATE INDEX IF NOT EXISTS idx_theory_topic ON theory_pages(topic_id, title);
CREATE INDEX IF NOT EXISTS idx_tasks_topic ON tasks(topic_id, difficulty, title);
CREATE INDEX IF NOT EXISTS idx_attach_link ON attachments(linked_type, linked_id, uploaded_at);


CREATE TABLE IF NOT EXISTS task_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '',
  expected TEXT NOT NULL DEFAULT '',
  comparison TEXT NOT NULL DEFAULT 'tokens' CHECK (comparison IN ('tokens','exact')),
  is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS code_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('tests','custom')),
  status TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tests_task ON task_tests(task_id,sort_order);
CREATE INDEX IF NOT EXISTS idx_submissions_user_task ON code_submissions(user_id,task_id,id);

CREATE TABLE IF NOT EXISTS local_content_imports (
  source_key TEXT PRIMARY KEY,
  record_type TEXT NOT NULL CHECK(record_type IN ('theory','task')),
  record_id INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  source_file TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE IF NOT EXISTS local_import_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
