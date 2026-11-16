const path = require('path');
const { initDb } = require('../src/db');
const db = initDb({ dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data') });
try {
  const topic = db.prepare("SELECT id FROM topics WHERE title='Sveikųjų ir realiųjų skaičių įvestis' ORDER BY id LIMIT 1").get() || db.prepare('SELECT id FROM topics ORDER BY id LIMIT 1').get();
  if (!topic) throw new Error('Pirmiausia sukurkite bent vieną mokymosi temą.');
  const title = 'Dviejų sveikųjų skaičių suma — automatinis tikrinimas';
  let task = db.prepare('SELECT id FROM tasks WHERE title=? AND topic_id=?').get(title,topic.id);
  if (!task) task = { id: db.prepare('INSERT INTO tasks (topic_id,title,short_description,difficulty,statement,input_desc,output_desc,examples) VALUES (?,?,?,?,?,?,?,?)')
    .run(topic.id,title,'Pavyzdinė užduotis C++ tikrinimo aplinkai išbandyti.',1,'Duoti du sveikieji skaičiai a ir b. Apskaičiuokite jų sumą.','Du sveikieji skaičiai nuo -1000000000 iki 1000000000, atskirti tarpu.','Išveskite vieną sveikąjį skaičių — a ir b sumą. Nerašykite papildomų paaiškinimų.','Įvestis:\n3 7\nIšvestis:\n10').lastInsertRowid };
  if (!db.prepare('SELECT id FROM task_tests WHERE task_id=? LIMIT 1').get(task.id)) {
    const add=db.prepare('INSERT INTO task_tests (task_id,name,input,expected,comparison,is_hidden,sort_order) VALUES (?,?,?,?,?,?,?)');
    db.transaction(()=>{add.run(task.id,'Pavyzdys','3 7\n','10\n','tokens',0,0);add.run(task.id,'Nuliai','0 0\n','0\n','tokens',0,1);add.run(task.id,'Paslėptas testas 1','-1000000000 999999999\n','-1\n','tokens',1,2);})();
  }
  console.log('JUDGE_DEMO_TASK_ID='+task.id);
} finally { db.close(); }
