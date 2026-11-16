const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'data', 'app.sqlite'));
const g = db.prepare('SELECT id, title FROM topic_groups WHERE title = ?').get('C++ kursas');
if (!g) {
  // eslint-disable-next-line no-console
  console.log('Nerasta grupė: C++ kursas');
  process.exit(1);
}

const topics = db.prepare('SELECT COUNT(*) AS c FROM topics WHERE group_id = ?').get(g.id).c;
const theory = db
  .prepare('SELECT COUNT(*) AS c FROM theory_pages WHERE topic_id IN (SELECT id FROM topics WHERE group_id = ?)')
  .get(g.id).c;
const tasks = db
  .prepare('SELECT COUNT(*) AS c FROM tasks WHERE topic_id IN (SELECT id FROM topics WHERE group_id = ?)')
  .get(g.id).c;
const attachments = db
  .prepare(
    `SELECT COUNT(*) AS c
     FROM attachments
     WHERE (linked_type = 'theory' AND linked_id IN (SELECT id FROM theory_pages))
        OR (linked_type = 'task' AND linked_id IN (SELECT id FROM tasks))`
  )
  .get().c;

// eslint-disable-next-line no-console
console.log({ group: g, topics, theory, tasks, attachments });
db.close();

