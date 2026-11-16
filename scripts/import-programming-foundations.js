const fs = require('fs');
const path = require('path');
const { initDb } = require('../src/db');
const catalog = require('../db/programming-foundations.json');
async function run() {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const existed = fs.existsSync(path.join(dataDir, 'app.sqlite'));
  const db = initDb({ dataDir });
  try {
    if (existed) await db.backup(path.join(dataDir, 'before-programming-' + Date.now() + '.sqlite'));
    const added = { groups: 0, topics: 0, theory: 0, practice: 0, references: 0 };
    db.transaction(() => {
      catalog.groups.forEach((group, gi) => {
        let row = db.prepare('SELECT id FROM topic_groups WHERE title = ?').get(group.title);
        const groupId = row ? row.id : db.prepare('INSERT INTO topic_groups (title, description, sort_order) VALUES (?, ?, ?)').run(group.title, group.description, -600 + gi).lastInsertRowid;
        if (!row) added.groups++;
        group.topics.forEach((topic, ti) => {
          row = db.prepare('SELECT id FROM topics WHERE group_id = ? AND title = ?').get(groupId, topic.title);
          const topicId = row ? row.id : db.prepare('INSERT INTO topics (group_id, title, short_description, sort_order) VALUES (?, ?, ?, ?)').run(groupId, topic.title, topic.summary, ti + 1).lastInsertRowid;
          if (!row) added.topics++;
          const theoryTitle = topic.title + ' — mokymosi gairės';
          let theory = db.prepare('SELECT id FROM theory_pages WHERE topic_id = ? AND title = ?').get(topicId, theoryTitle);
          const references = topic.sources.map(s => '- [' + s.title + '](https://progmis.lt/topic/' + s.id + ')').join('\n');
          const coverage = topic.sources.length ? (topic.extension ? 'Čia pateikiamas sudėtingesnis ankstesnių PROGMIS temų taikymas pagal IV klasės planą.' : 'PROGMIS nuorodoje rasite originalią teoriją ir automatiniu būdu tikrinamas užduotis.') : 'Papildoma tema pagal mokytojo planą; šiame PROGMIS C++ kurse atskiro skyriaus nerasta.';
          const md = '# ' + topic.title + '\n\n' + topic.summary + '\n\n## Kaip mokytis\n\n1. Paaiškink pagrindinę idėją savais žodžiais.\n2. Išspręsk savarankišką užduotį ir numatyk jos rezultatą.\n3. Patikrink įprastus bei ribinius atvejus.\n\n## Savarankiška praktika\n\n' + topic.practice + '\n\n## Ryšys su PROGMIS kursu\n\n' + coverage + '\n\n' + references + '\n\nPROGMIS medžiagai gali reikėti atskiro prisijungimo ir prieigos. Šiame puslapyje pateikti originalūs paaiškinimai; PROGMIS sąlygos ir teorijos tekstai nekopijuoti.';
          if (!theory) {
            theory = { id: db.prepare('INSERT INTO theory_pages (topic_id,title,short_description,content_markdown,summary) VALUES (?,?,?,?,?)').run(topicId,theoryTitle,'Pagrindinė idėja, savarankiška praktika ir kurso nuorodos.',md,topic.summary).lastInsertRowid };
            added.theory++;
          }
          const localTitle = 'Savarankiška praktika: ' + topic.title;
          let task = db.prepare('SELECT id FROM tasks WHERE topic_id = ? AND title = ?').get(topicId,localTitle);
          if (!task) {
            task = { id: db.prepare('INSERT INTO tasks (topic_id,title,short_description,difficulty,statement,tags) VALUES (?,?,?,?,?,?)').run(topicId,localTitle,'Originali praktinė užduotis įgūdžiams įtvirtinti.',gi+1,topic.practice,'C++,savarankiška praktika').lastInsertRowid };
            added.practice++;
          }
          db.prepare('INSERT OR IGNORE INTO theory_task_links (theory_id,task_id) VALUES (?,?)').run(theory.id,task.id);
          if (!topic.extension) topic.sources.forEach(source => source.tasks.forEach(reference => {
            const existing = db.prepare('SELECT id FROM tasks WHERE topic_id = ? AND external_url = ?').get(topicId,reference.url);
            let id = existing && existing.id;
            if (!id) {
              const name = reference.title.replace(/^\\d+\\.\\s*/, '').replace(/\\s*-\\s*$/, '');
              id = db.prepare('INSERT INTO tasks (topic_id,title,short_description,difficulty,statement,tags,external_url) VALUES (?,?,?,?,?,?,?)').run(topicId,'PROGMIS · '+name,'Išorinė PROGMIS užduotis. Sąlyga ir tikrinimas originaliame puslapyje.',gi+1,'Šią užduotį spręskite PROGMIS sistemoje. Mygtukas atvers originalią sąlygą ir sprendimo aplinką. Prireikus prisijunkite savo paskyra.','C++,PROGMIS,išorinė užduotis',reference.url).lastInsertRowid;
              added.references++;
            }
            db.prepare('INSERT OR IGNORE INTO theory_task_links (theory_id,task_id) VALUES (?,?)').run(theory.id,id);
          }));
        });
      });
    })();
    console.log(JSON.stringify(added));
  } finally { db.close(); }
}
run().catch(error => { console.error(error); process.exitCode=1; });
