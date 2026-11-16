const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let db;

function getDb() {
  if (!db) throw new Error('DB dar neinicijuota. Kviečiama initDb() per serverio startą.');
  return db;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function initDb({ dataDir }) {
  ensureDir(dataDir);
  const dbPath = path.join(dataDir, 'app.sqlite');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  }

  const topicColumns = db.prepare('PRAGMA table_info(topics)').all();
  if (!topicColumns.some((column) => column.name === 'is_current')) {
    db.exec('ALTER TABLE topics ADD COLUMN is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1))');
  }
  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all();
  if (!taskColumns.some(column => column.name === 'external_url')) {
    db.exec('ALTER TABLE tasks ADD COLUMN external_url TEXT');
  }
  if (!taskColumns.some(column => column.name === 'content_format')) {
    db.exec("ALTER TABLE tasks ADD COLUMN content_format TEXT NOT NULL DEFAULT 'text' CHECK(content_format IN ('text','html'))");
  }
  return db;
}

module.exports = { initDb, getDb };

