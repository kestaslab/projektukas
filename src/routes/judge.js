const express = require('express');
const { getDb } = require('../db');
const { requireAdmin } = require('../middlewares/requireAdmin');
const { judge } = require('../services/cppJudge');
const router = express.Router();
const runningUsers = new Set();

function taskFor(id) {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return getDb().prepare(`SELECT tk.* FROM tasks tk JOIN topics t ON tk.topic_id=t.id
    JOIN topic_groups g ON t.group_id=g.id WHERE tk.id=? AND t.is_active=1 AND g.is_active=1`).get(id);
}
router.get('/app/uzduotis/:id', (req, res, next) => {
  const id = Number(req.params.id), db = getDb();
  if (!Number.isSafeInteger(id)) return next();
  res.locals.judgeTestCount = db.prepare('SELECT COUNT(*) AS count FROM task_tests WHERE task_id=?').get(id).count;
  res.locals.judgeHistory = db.prepare('SELECT status,created_at FROM code_submissions WHERE task_id=? AND user_id=? ORDER BY id DESC LIMIT 5').all(id,req.session.userId);
  res.locals.judgeLastCode = db.prepare('SELECT code FROM code_submissions WHERE task_id=? AND user_id=? ORDER BY id DESC LIMIT 1').get(id,req.session.userId)?.code || '';
  return next();
});
router.post('/app/uzduotis/:id/tikrinti', async (req, res, next) => {
  const id = Number(req.params.id), userId = req.session.userId;
  if (!taskFor(id)) return res.status(404).json({ message: 'Užduotis nerasta.' });
  const source = req.body.code;
  if (typeof source !== 'string' || !source.trim() || Buffer.byteLength(source, 'utf8') > 65536) return res.status(400).json({ message: 'Įrašykite C++ kodą iki 64 KB.' });
  if (!['custom', 'tests'].includes(req.body.mode)) return res.status(400).json({ message: 'Pasirinkite tikrinimo būdą.' });
  if (runningUsers.has(userId)) return res.status(429).json({ message: 'Jūsų ankstesnis sprendimas dar tikrinamas.' });
  let tests;
  if (req.body.mode === 'custom') {
    if (typeof req.body.input !== 'string' || Buffer.byteLength(req.body.input) > 8192) return res.status(400).json({ message: 'Bandymo įvestis turi būti iki 8 KB.' });
    tests = [{ name: 'Mano bandymas', input: req.body.input, hidden: false }];
  } else {
    tests = getDb().prepare('SELECT name,input,expected,comparison,is_hidden AS hidden FROM task_tests WHERE task_id=? ORDER BY sort_order,id').all(id);
    if (!tests.length) return res.status(422).json({ message: 'Mokytojas šiai užduočiai dar nepridėjo testų. Galite naudoti „Bandyti su mano įvestimi“.' });
  }
  runningUsers.add(userId);
  try {
    const result = await judge(source, tests);
    getDb().prepare('INSERT INTO code_submissions (user_id,task_id,code,mode,status,result_json) VALUES (?,?,?,?,?,?)')
      .run(userId,id,source,req.body.mode,result.status,JSON.stringify(result));
    return res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  } finally { runningUsers.delete(userId); }
});

router.get('/admin/uzduotys/:id/testai', requireAdmin, (req, res) => {
  const task = taskFor(Number(req.params.id));
  if (!task) return res.status(404).send('Užduotis nerasta.');
  const tests = getDb().prepare('SELECT * FROM task_tests WHERE task_id=? ORDER BY sort_order,id').all(task.id);
  return res.render('admin/task_tests', { title: 'Užduoties testai', task, tests, error: null });
});
router.post('/admin/uzduotys/:id/testai', requireAdmin, (req, res) => {
  const task = taskFor(Number(req.params.id));
  if (!task) return res.status(404).send('Užduotis nerasta.');
  let tests;
  try {
    tests = JSON.parse(req.body.tests_json);
    if (!Array.isArray(tests) || tests.length > 10) throw new Error('Leidžiama iki 10 testų.');
    tests.forEach(t => {
      if (!t || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 80 || typeof t.input !== 'string' || typeof t.expected !== 'string'
        || Buffer.byteLength(t.input) > 8192 || Buffer.byteLength(t.expected) > 8192 || !['tokens','exact'].includes(t.comparison) || typeof t.hidden !== 'boolean') throw new Error('Patikrinkite testų pavadinimus, įvestį ir išvestį (iki 8 KB).');
    });
  } catch (error) {
    return res.status(400).send(error.message || 'Netinkamas testų formatas.');
  }
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM task_tests WHERE task_id=?').run(task.id);
    const add = db.prepare('INSERT INTO task_tests (task_id,name,input,expected,comparison,is_hidden,sort_order) VALUES (?,?,?,?,?,?,?)');
    tests.forEach((t,i) => add.run(task.id,t.name.trim(),t.input,t.expected,t.comparison,t.hidden?1:0,i));
  })();
  return res.redirect('/app/uzduotis/' + task.id);
});
module.exports = router;
