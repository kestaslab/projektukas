const path = require('path');
const { initDb, getDb } = require('../src/db');
const { hashPassword } = require('../src/utils/passwords');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

initDb({ dataDir: DATA_DIR });
const db = getDb();

function upsertUser({ username, fullName, role, password, isActive = 1 }) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  const passwordHash = hashPassword(password);
  if (existing) {
    db.prepare(
      `UPDATE users
       SET full_name = ?, role = ?, password_hash = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(fullName, role, passwordHash, isActive, existing.id);
    return existing.id;
  }
  const info = db
    .prepare(
      `INSERT INTO users (username, full_name, role, password_hash, is_active)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(username, fullName, role, passwordHash, isActive);
  return info.lastInsertRowid;
}

function insertGroup({ title, description, sortOrder, isActive = 1 }) {
  const info = db
    .prepare(
      `INSERT INTO topic_groups (title, description, sort_order, is_active)
       VALUES (?, ?, ?, ?)`
    )
    .run(title, description, sortOrder, isActive);
  return info.lastInsertRowid;
}

function insertTopic({ groupId, title, shortDescription, sortOrder, isActive = 1 }) {
  const info = db
    .prepare(
      `INSERT INTO topics (group_id, title, short_description, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(groupId, title, shortDescription, sortOrder, isActive);
  return info.lastInsertRowid;
}

function insertTheory({ topicId, title, shortDescription, contentMarkdown, summary }) {
  const info = db
    .prepare(
      `INSERT INTO theory_pages (topic_id, title, short_description, content_markdown, summary)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(topicId, title, shortDescription, contentMarkdown, summary);
  return info.lastInsertRowid;
}

function insertTask({
  topicId,
  title,
  shortDescription,
  difficulty,
  statement,
  inputDesc,
  outputDesc,
  examples,
  teacherNotes,
  hint,
  tags
}) {
  const info = db
    .prepare(
      `INSERT INTO tasks
        (topic_id, title, short_description, difficulty, statement, input_desc, output_desc, examples, teacher_notes, hint, tags)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      topicId,
      title,
      shortDescription,
      difficulty,
      statement,
      inputDesc,
      outputDesc,
      examples,
      teacherNotes,
      hint,
      tags
    );
  return info.lastInsertRowid;
}

function clearContent() {
  db.exec(`
    DELETE FROM theory_task_links;
    DELETE FROM attachments;
    DELETE FROM theory_pages;
    DELETE FROM tasks;
    DELETE FROM topics;
    DELETE FROM topic_groups;
  `);
}

db.exec('BEGIN');
try {
  clearContent();

  // Vartotojai
  upsertUser({ username: 'admin', fullName: 'Mokytojas Admin', role: 'admin', password: 'Admin123!' });
  upsertUser({ username: 'mokinys1', fullName: 'Mokinys Vienas', role: 'student', password: 'Mokinys123!' });
  upsertUser({ username: 'mokinys2', fullName: 'Mokinys Du', role: 'student', password: 'Mokinys123!' });
  upsertUser({ username: 'mokinys3', fullName: 'Mokinys Trys', role: 'student', password: 'Mokinys123!' });

  // Temų grupės
  const g1 = insertGroup({
    title: 'Programavimo pagrindai',
    description: 'Pagrindinės sąvokos, sintaksė ir pirmi žingsniai C++.',
    sortOrder: 1
  });
  const g2 = insertGroup({
    title: 'Sąlygos ir ciklai',
    description: 'Valdymo struktūros: if, for, while.',
    sortOrder: 2
  });
  const g3 = insertGroup({
    title: 'Masyvai ir failai',
    description: 'Duomenų struktūros ir darbas su failais.',
    sortOrder: 3
  });

  // Temos (6)
  const t1 = insertTopic({
    groupId: g1,
    title: 'Duomenų tipai',
    shortDescription: 'int, long long, double, char, string.',
    sortOrder: 1
  });
  const t2 = insertTopic({
    groupId: g1,
    title: 'Įvestis ir išvestis',
    shortDescription: 'cin / cout ir formatavimas.',
    sortOrder: 2
  });
  const t3 = insertTopic({
    groupId: g2,
    title: 'if sakinys',
    shortDescription: 'Šakos ir logika.',
    sortOrder: 1
  });
  const t4 = insertTopic({
    groupId: g2,
    title: 'for ciklas',
    shortDescription: 'Kartojimas su skaitikliu.',
    sortOrder: 2
  });
  const t5 = insertTopic({
    groupId: g2,
    title: 'while ciklas',
    shortDescription: 'Kartojimas su sąlyga.',
    sortOrder: 3
  });
  const t6 = insertTopic({
    groupId: g3,
    title: 'Duomenų skaitymas iš failo',
    shortDescription: 'ifstream/ofstream ir pagrindiniai pavyzdžiai.',
    sortOrder: 2
  });

  // Teorija (3)
  const th1 = insertTheory({
    topicId: t1,
    title: 'Duomenų tipų apžvalga',
    shortDescription: 'Dažniausi tipai ir jų panaudojimas.',
    contentMarkdown:
      '# Duomenų tipai\n\n- `int` – sveikie skaičiai.\n- `long long` – didesni sveikie.\n- `double` – realieji.\n- `string` – tekstas.\n\n> Patarimas: rinkitės tipą pagal reikalingą rėžį.\n',
    summary: 'Trumpa tipų atmintinė.'
  });

  const th2 = insertTheory({
    topicId: t3,
    title: 'if sakinys ir palyginimai',
    shortDescription: 'Sąlygos, operatoriai ir pavyzdžiai.',
    contentMarkdown:
      '# if sakinys\n\nPavyzdys:\n\n```cpp\nif (a > b) {\n  cout << \"a didesnis\";\n} else {\n  cout << \"b didesnis arba lygus\";\n}\n```\n',
    summary: 'Jei/jei ne struktūra.'
  });

  const th3 = insertTheory({
    topicId: t6,
    title: 'Darbas su failais',
    shortDescription: 'Kaip skaityti ir rašyti į failus.',
    contentMarkdown:
      '# Failai\n\nNaudokite `ifstream` skaitymui ir `ofstream` rašymui.\n\n```cpp\nifstream fin(\"duomenys.txt\");\nint x;\nfin >> x;\n```\n',
    summary: 'Pagrindinis failų skaitymo pavyzdys.'
  });

  // Užduotys (5)
  const u1 = insertTask({
    topicId: t2,
    title: 'Sveikinimas',
    shortDescription: 'Išveskite tekstą.',
    difficulty: 1,
    statement: 'Parašykite programą, kuri išveda: "Sveiki, pasauli!".',
    inputDesc: 'Įvesties nėra.',
    outputDesc: 'Išveskite vieną eilutę su tekstu.',
    examples: 'Išvestis:\nSveiki, pasauli!',
    teacherNotes: 'Pirma užduotis susipažinimui su cout.',
    hint: 'Naudokite cout.',
    tags: 'pradžia,cout'
  });

  const u2 = insertTask({
    topicId: t3,
    title: 'Didžiausias iš dviejų',
    shortDescription: 'Palyginkite du skaičius.',
    difficulty: 2,
    statement: 'Duoti du sveikie skaičiai a ir b. Išveskite didesnį.',
    inputDesc: 'Du sveikie skaičiai a ir b.',
    outputDesc: 'Didesnis skaičius.',
    examples: 'Įvestis:\n3 7\nIšvestis:\n7',
    teacherNotes: 'Patikrinti if/else supratimą.',
    hint: 'Jei a > b, išveskite a, kitaip b.',
    tags: 'if,palyginimas'
  });

  const u3 = insertTask({
    topicId: t4,
    title: 'Suma nuo 1 iki n',
    shortDescription: 'Ciklas su skaitikliu.',
    difficulty: 2,
    statement: 'Duotas n. Apskaičiuokite 1 + 2 + ... + n.',
    inputDesc: 'Vienas sveikas skaičius n (1 ≤ n ≤ 10^6).',
    outputDesc: 'Suma.',
    examples: 'Įvestis:\n5\nIšvestis:\n15',
    teacherNotes: 'Galima aptarti ir formulę, bet čia tik for.',
    hint: 'Naudokite for ciklą ir akumuliatorių.',
    tags: 'for,suma'
  });

  const u4 = insertTask({
    topicId: t5,
    title: 'Skaičių kiekis iki 0',
    shortDescription: 'while ciklas.',
    difficulty: 3,
    statement: 'Skaitomi sveikie skaičiai iki kol įvestas 0. Išveskite kiek skaičių buvo įvesta (0 neskaičiuoti).',
    inputDesc: 'Skaičių seka, pasibaigianti 0.',
    outputDesc: 'Įvestų skaičių kiekis.',
    examples: 'Įvestis:\n5 1 -2 0\nIšvestis:\n3',
    teacherNotes: 'while su nuskaitymu cikle.',
    hint: 'Skaitykite x, kol x != 0.',
    tags: 'while,ciklas'
  });

  const u5 = insertTask({
    topicId: t6,
    title: 'Skaitymas iš failo',
    shortDescription: 'Perskaitykite du skaičius ir išveskite sumą.',
    difficulty: 3,
    statement: 'Faile yra du sveikie skaičiai. Perskaitykite ir išveskite jų sumą.',
    inputDesc: 'Failas `duomenys.txt`: du skaičiai.',
    outputDesc: 'Suma.',
    examples: 'duomenys.txt:\n10 20\nIšvestis:\n30',
    teacherNotes: 'Tinka kaip teorijos pritaikymas.',
    hint: 'Naudokite ifstream.',
    tags: 'failai,ifstream'
  });

  // Susiejimai teorija <-> užduotys (pavyzdys)
  db.prepare('INSERT INTO theory_task_links (theory_id, task_id) VALUES (?, ?)').run(th2, u2);
  db.prepare('INSERT INTO theory_task_links (theory_id, task_id) VALUES (?, ?)').run(th2, u3);
  db.prepare('INSERT INTO theory_task_links (theory_id, task_id) VALUES (?, ?)').run(th3, u5);

  db.exec('COMMIT');
  // eslint-disable-next-line no-console
  console.log('Seed baigtas. Prisijungimai: admin/Admin123! ir mokiniai (mokinys1..3 / Mokinys123!).');
} catch (e) {
  db.exec('ROLLBACK');
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
} finally {
  db.close();
}

