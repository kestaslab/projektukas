const fs = require('fs');
const path = require('path');
const { initDb } = require('../src/db');
const catalog = require('../db/curriculum-2026-2027.json');

async function run() {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const existed = fs.existsSync(path.join(dataDir, 'app.sqlite'));
  const db = initDb({ dataDir });
  try {
    if (existed) {
      const backup = path.join(dataDir, 'before-curriculum-' + Date.now() + '.sqlite');
      await db.backup(backup);
      console.log('DB kopija: ' + backup);
    }
    let groupsAdded = 0;
    let topicsAdded = 0;
    db.transaction(() => {
      catalog.groups.forEach((group, groupIndex) => {
        let existing = db.prepare('SELECT id FROM topic_groups WHERE title = ?').get(group.title);
        let groupId = existing && existing.id;
        if (!groupId) {
          groupId = db.prepare('INSERT INTO topic_groups (title, description, sort_order, is_active) VALUES (?, ?, ?, 1)')
            .run(group.title, group.description, -500 + groupIndex).lastInsertRowid;
          groupsAdded++;
        }
        group.topics.forEach((topic, index) => {
          if (db.prepare('SELECT id FROM topics WHERE group_id = ? AND title = ?').get(groupId, topic.title)) return;
          db.prepare('INSERT INTO topics (group_id, title, short_description, sort_order, is_active) VALUES (?, ?, ?, ?, 1)')
            .run(groupId, topic.title, topic.description, index + 1);
          topicsAdded++;
        });
      });
    })();
    console.log('Pridėta grupių: ' + groupsAdded + '; temų: ' + topicsAdded + '. Esamas turinys nepakeistas.');
  } finally {
    db.close();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
