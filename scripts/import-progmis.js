const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { initDb, getDb } = require('../src/db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
const IMPORT_ROOT = process.env.IMPORT_ROOT || path.join(__dirname, '..', 'import-src', 'c++ kursas');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToText(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '- ');
  s = s.replace(/<\/?[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/\r/g, '');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.replace(/[ \t]{2,}/g, ' ');
  return s.trim();
}

function extractBetween(haystack, startNeedle, endNeedle) {
  const start = haystack.indexOf(startNeedle);
  if (start === -1) return '';
  const from = start + startNeedle.length;
  const end = haystack.indexOf(endNeedle, from);
  if (end === -1) return haystack.slice(from);
  return haystack.slice(from, end);
}

function extractTagText(haystack, tagId) {
  const re = new RegExp(`<[^>]+id="${tagId}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i');
  const m = haystack.match(re);
  if (!m) return '';
  return htmlToText(m[1]);
}

function parseTaskHtml(html) {
  const title = extractTagText(html, 'taskModalLabel') || 'Užduotis';
  const bodyHtml = extractBetween(html, 'id="taskModalBody">', '</div>\n                                <div class="modal-footer"');
  const descHtml = extractBetween(bodyHtml, '<h4>Užduoties aprašymas</h4>', '<h4>Įvestis</h4>');
  const inputHtml = extractBetween(bodyHtml, '<h4>Įvestis</h4>', '<h4>Išvestis</h4>');
  const outputHtml = extractBetween(bodyHtml, '<h4>Išvestis</h4>', '</div>');
  return {
    title: title.trim(),
    statement: htmlToText(descHtml),
    input: htmlToText(inputHtml),
    output: htmlToText(outputHtml)
  };
}

function parseTheoryHtml(html) {
  const title = extractTagText(html, 'theoryModalLabel') || 'Teorija';
  const bodyHtml = extractBetween(html, 'id="theoryModalBody">', '</div><div class="modal-footer">');
  const content = htmlToText(bodyHtml);
  return { title: title.trim(), content };
}

function storeAttachment(db, { sourcePath, originalName, linkedType, linkedId }) {
  const ext = path.extname(originalName || '').toLowerCase();
  const storedName = crypto.randomBytes(16).toString('hex') + ext;
  const destPath = path.join(UPLOADS_DIR, storedName);
  fs.copyFileSync(sourcePath, destPath);

  const stat = fs.statSync(destPath);
  db.prepare(
    `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, linked_type, linked_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(originalName, storedName, 'text/html', stat.size, linkedType, linkedId);
}

function upsertTopicGroup(db, title) {
  const existing = db.prepare('SELECT id FROM topic_groups WHERE title = ?').get(title);
  if (existing) return existing.id;
  const info = db
    .prepare(`INSERT INTO topic_groups (title, description, sort_order, is_active) VALUES (?, ?, ?, 1)`)
    .run(title, 'Importuota iš vietinių PROGMIS HTML eksportų.', 100);
  return info.lastInsertRowid;
}

function insertTopic(db, { groupId, title, sortOrder }) {
  const info = db
    .prepare(
      `INSERT INTO topics (group_id, title, short_description, sort_order, is_active)
       VALUES (?, ?, ?, ?, 1)`
    )
    .run(groupId, title, 'Importuota tema.', sortOrder);
  return info.lastInsertRowid;
}

function run() {
  ensureDir(UPLOADS_DIR);
  if (!fs.existsSync(IMPORT_ROOT)) {
    // eslint-disable-next-line no-console
    console.error(`Nerastas IMPORT_ROOT: ${IMPORT_ROOT}`);
    process.exit(1);
  }

  initDb({ dataDir: DATA_DIR });
  const db = getDb();

  const groupId = upsertTopicGroup(db, 'C++ kursas');

  const topicDirs = fs
    .readdirSync(IMPORT_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => /^\d+ /.test(name))
    .sort((a, b) => Number(a.split(' ')[0]) - Number(b.split(' ')[0]));

  db.exec('BEGIN');
  try {
    for (const dirName of topicDirs) {
      const sortOrder = Number(dirName.split(' ')[0]);
      const topicTitle = dirName.replace(/^\d+\s+/, '').trim();
      const topicPath = path.join(IMPORT_ROOT, dirName);

      const topicId = insertTopic(db, { groupId, title: topicTitle, sortOrder });

      const theoryDir = path.join(topicPath, 'Teorija');
      if (fs.existsSync(theoryDir)) {
        const theoryFiles = fs
          .readdirSync(theoryDir, { withFileTypes: true })
          .filter((f) => f.isFile() && f.name.toLowerCase().endsWith('.html'))
          .map((f) => f.name)
          .sort();

        for (const fileName of theoryFiles) {
          const abs = path.join(theoryDir, fileName);
          const html = fs.readFileSync(abs, 'utf8');
          const parsed = parseTheoryHtml(html);
          const md = `# ${parsed.title}\n\n${parsed.content}\n`;
          const info = db
            .prepare(
              `INSERT INTO theory_pages (topic_id, title, short_description, content_markdown, summary)
               VALUES (?, ?, ?, ?, ?)`
            )
            .run(topicId, parsed.title, 'Importuota teorija.', md, null);
          const theoryId = info.lastInsertRowid;

          // prisegam originalų HTML
          storeAttachment(db, {
            sourcePath: abs,
            originalName: fileName,
            linkedType: 'theory',
            linkedId: theoryId
          });
        }
      }

      const tasksDir = path.join(topicPath, 'Užduotys');
      if (fs.existsSync(tasksDir)) {
        const taskFiles = fs
          .readdirSync(tasksDir, { withFileTypes: true })
          .filter((f) => f.isFile() && f.name.toLowerCase().endsWith('.html'))
          .map((f) => f.name)
          .sort();

        for (const fileName of taskFiles) {
          const abs = path.join(tasksDir, fileName);
          const html = fs.readFileSync(abs, 'utf8');
          const parsed = parseTaskHtml(html);

          const info = db
            .prepare(
              `INSERT INTO tasks
                (topic_id, title, short_description, difficulty, statement, input_desc, output_desc, examples, teacher_notes, hint, tags)
               VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              topicId,
              parsed.title,
              'Importuota užduotis.',
              2,
              parsed.statement || '(Nepavyko ištraukti aprašymo iš HTML.)',
              parsed.input || null,
              parsed.output || null,
              null,
              null,
              null,
              'importas'
            );
          const taskId = info.lastInsertRowid;

          // prisegam originalų HTML
          storeAttachment(db, {
            sourcePath: abs,
            originalName: fileName,
            linkedType: 'task',
            linkedId: taskId
          });
        }
      }
    }

    db.exec('COMMIT');
    // eslint-disable-next-line no-console
    console.log(`Importas baigtas. Temos: ${topicDirs.length}. Grupė: C++ kursas.`);
  } catch (e) {
    db.exec('ROLLBACK');
    // eslint-disable-next-line no-console
    console.error(e);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

run();

