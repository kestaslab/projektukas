const express = require('express');
const { requireAdmin } = require('../middlewares/requireAdmin');
const { getDb } = require('../db');
const { hashPassword } = require('../utils/passwords');
const { buildUpload } = require('../middlewares/upload');
const fs = require('fs');
const path = require('path');

function parseIntOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = function adminRoutes({ uploadsDir }) {
  const router = express.Router();
  const upload = buildUpload({ uploadsDir });

  router.use(requireAdmin);

router.post('/temos/:id/einama', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const value = req.body.is_current;
    if (!Number.isSafeInteger(id) || id < 1 || !['0', '1'].includes(value)) {
      return res.status(400).send('Neteisingi temos duomenys.');
    }
    const result = getDb().prepare('UPDATE topics SET is_current = ? WHERE id = ?').run(Number(value), id);
    if (!result.changes) return res.status(404).send('Tema nerasta.');
    return res.redirect('/app/tema/' + id);
  } catch (error) {
    return next(error);
  }
});

router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const counts = {
      users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
      groups: db.prepare('SELECT COUNT(*) AS c FROM topic_groups').get().c,
      topics: db.prepare('SELECT COUNT(*) AS c FROM topics').get().c,
      theory: db.prepare('SELECT COUNT(*) AS c FROM theory_pages').get().c,
      tasks: db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c,
      files: db.prepare('SELECT COUNT(*) AS c FROM attachments').get().c
    };

    return res.render('admin/dashboard', { title: 'Admin skydelis', counts, q: '' });
  } catch (e) {
    return next(e);
  }
});

// ===== Vartotojai =====
router.get('/vartotojai', (req, res, next) => {
  try {
    const db = getDb();
    const users = db
      .prepare(
        `SELECT id, username, full_name, role, is_active, created_at, updated_at
         FROM users
         ORDER BY role DESC, username ASC`
      )
      .all();
    return res.render('admin/users_list', { title: 'Vartotojai', users, q: '' });
  } catch (e) {
    return next(e);
  }
});

router.get('/vartotojai/naujas', (req, res) => {
  return res.render('admin/user_form', {
    title: 'Naujas vartotojas',
    mode: 'create',
    error: null,
    user: { username: '', full_name: '', role: 'student', is_active: 1 },
    tempPassword: 'Laikinas123!'
  });
});

router.post('/vartotojai/naujas', (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const fullName = String(req.body.full_name || '').trim();
    const role = req.body.role === 'admin' ? 'admin' : 'student';
    const isActive = req.body.is_active === '1' ? 1 : 0;
    const password = String(req.body.password || '').trim();

    if (!username || !fullName || !password) {
      return res.status(400).render('admin/user_form', {
        title: 'Naujas vartotojas',
        mode: 'create',
        error: 'Užpildykite vartotojo vardą, vardą/pavardę ir slaptažodį.',
        user: { username, full_name: fullName, role, is_active: isActive },
        tempPassword: password || 'Laikinas123!'
      });
    }

    const db = getDb();
    db.prepare(
      `INSERT INTO users (username, full_name, role, password_hash, is_active)
       VALUES (?, ?, ?, ?, ?)`
    ).run(username, fullName, role, hashPassword(password), isActive);

    return res.redirect('/admin/vartotojai');
  } catch (e) {
    if (String(e && e.message).includes('UNIQUE')) {
      return res.status(400).render('admin/user_form', {
        title: 'Naujas vartotojas',
        mode: 'create',
        error: 'Toks vartotojo vardas jau egzistuoja.',
        user: {
          username: String(req.body.username || '').trim(),
          full_name: String(req.body.full_name || '').trim(),
          role: req.body.role === 'admin' ? 'admin' : 'student',
          is_active: req.body.is_active === '1' ? 1 : 0
        },
        tempPassword: String(req.body.password || '').trim() || 'Laikinas123!'
      });
    }
    return next(e);
  }
});

router.get('/vartotojai/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    const user = db
      .prepare('SELECT id, username, full_name, role, is_active, created_at, updated_at FROM users WHERE id = ?')
      .get(id);
    if (!user) return res.status(404).render('errors/403', { title: 'Nerasta', message: 'Vartotojas nerastas.' });
    return res.render('admin/user_form', { title: 'Redaguoti vartotoją', mode: 'edit', error: null, user });
  } catch (e) {
    return next(e);
  }
});

router.post('/vartotojai/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const fullName = String(req.body.full_name || '').trim();
    const role = req.body.role === 'admin' ? 'admin' : 'student';
    const isActive = req.body.is_active === '1' ? 1 : 0;

    if (!fullName) {
      const db = getDb();
      const user = db
        .prepare('SELECT id, username, full_name, role, is_active, created_at, updated_at FROM users WHERE id = ?')
        .get(id);
      return res.status(400).render('admin/user_form', {
        title: 'Redaguoti vartotoją',
        mode: 'edit',
        error: 'Vardas/pavardė negali būti tuščia.',
        user: { ...user, full_name: fullName, role, is_active: isActive }
      });
    }

    const db = getDb();
    db.prepare(
      `UPDATE users
       SET full_name = ?, role = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(fullName, role, isActive, id);

    return res.redirect('/admin/vartotojai');
  } catch (e) {
    return next(e);
  }
});

router.post('/vartotojai/:id/slaptazodis', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const password = String(req.body.password || '').trim();
    if (!password) return res.status(400).redirect(`/admin/vartotojai/${id}`);

    const db = getDb();
    db.prepare(
      `UPDATE users
       SET password_hash = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(hashPassword(password), id);

    return res.redirect(`/admin/vartotojai/${id}`);
  } catch (e) {
    return next(e);
  }
});

router.post('/vartotojai/:id/trinti', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return res.redirect('/admin/vartotojai');
  } catch (e) {
    return next(e);
  }
});

// ===== Temų grupės / Temos / Teorija / Užduotys / Failai =====
router.get('/temu-grupes', (req, res, next) => {
  try {
    const db = getDb();
    const groups = db
      .prepare(
        `SELECT id, title, description, sort_order, is_active, updated_at
         FROM topic_groups
         ORDER BY sort_order ASC, title ASC`
      )
      .all();
    return res.render('admin/groups_list', { title: 'Temų grupės', groups, q: '' });
  } catch (e) {
    return next(e);
  }
});

router.get('/temu-grupes/nauja', (req, res) => {
  return res.render('admin/group_form', {
    title: 'Nauja temų grupė',
    mode: 'create',
    error: null,
    group: { title: '', description: '', sort_order: 0, is_active: 1 }
  });
});

router.post('/temu-grupes/nauja', (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const sortOrder = parseIntOrNull(req.body.sort_order) ?? 0;
    const isActive = req.body.is_active === '1' ? 1 : 0;
    if (!title) {
      return res.status(400).render('admin/group_form', {
        title: 'Nauja temų grupė',
        mode: 'create',
        error: 'Pavadinimas negali būti tuščias.',
        group: { title, description, sort_order: sortOrder, is_active: isActive }
      });
    }
    const db = getDb();
    db.prepare(
      `INSERT INTO topic_groups (title, description, sort_order, is_active)
       VALUES (?, ?, ?, ?)`
    ).run(title, description || null, sortOrder, isActive);
    return res.redirect('/admin/temu-grupes');
  } catch (e) {
    return next(e);
  }
});

router.get('/temu-grupes/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    const group = db
      .prepare('SELECT id, title, description, sort_order, is_active FROM topic_groups WHERE id = ?')
      .get(id);
    if (!group) return res.status(404).render('errors/403', { title: 'Nerasta', message: 'Grupė nerasta.' });
    return res.render('admin/group_form', { title: 'Redaguoti temų grupę', mode: 'edit', error: null, group });
  } catch (e) {
    return next(e);
  }
});

router.post('/temu-grupes/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const sortOrder = parseIntOrNull(req.body.sort_order) ?? 0;
    const isActive = req.body.is_active === '1' ? 1 : 0;
    if (!title) {
      return res.status(400).render('admin/group_form', {
        title: 'Redaguoti temų grupę',
        mode: 'edit',
        error: 'Pavadinimas negali būti tuščias.',
        group: { id, title, description, sort_order: sortOrder, is_active: isActive }
      });
    }
    const db = getDb();
    db.prepare(
      `UPDATE topic_groups
       SET title = ?, description = ?, sort_order = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(title, description || null, sortOrder, isActive, id);
    return res.redirect('/admin/temu-grupes');
  } catch (e) {
    return next(e);
  }
});

router.post('/temu-grupes/:id/trinti', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    db.prepare('DELETE FROM topic_groups WHERE id = ?').run(id);
    return res.redirect('/admin/temu-grupes');
  } catch (e) {
    return next(e);
  }
});

// Temos
router.get('/temos', (req, res, next) => {
  try {
    const groupId = parseIntOrNull(req.query.grupe);
    const db = getDb();
    const groups = db
      .prepare('SELECT id, title FROM topic_groups ORDER BY sort_order ASC, title ASC')
      .all();

    const topics = db
      .prepare(
        `SELECT t.id, t.title, t.short_description, t.sort_order, t.is_active, t.updated_at,
                g.title AS group_title, g.id AS group_id
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         WHERE (@groupId IS NULL OR g.id = @groupId)
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all({ groupId });

    return res.render('admin/topics_list', { title: 'Temos', groups, topics, groupId, q: '' });
  } catch (e) {
    return next(e);
  }
});

router.get('/temos/nauja', (req, res, next) => {
  try {
    const db = getDb();
    const groups = db
      .prepare('SELECT id, title FROM topic_groups ORDER BY sort_order ASC, title ASC')
      .all();
    return res.render('admin/topic_form', {
      title: 'Nauja tema',
      mode: 'create',
      error: null,
      groups,
      topic: { group_id: groups[0]?.id || '', title: '', short_description: '', sort_order: 0, is_active: 1 }
    });
  } catch (e) {
    return next(e);
  }
});

router.post('/temos/nauja', (req, res, next) => {
  try {
    const groupId = Number(req.body.group_id);
    const title = String(req.body.title || '').trim();
    const shortDescription = String(req.body.short_description || '').trim();
    const sortOrder = parseIntOrNull(req.body.sort_order) ?? 0;
    const isActive = req.body.is_active === '1' ? 1 : 0;

    const db = getDb();
    const groups = db
      .prepare('SELECT id, title FROM topic_groups ORDER BY sort_order ASC, title ASC')
      .all();

    if (!groupId || !title) {
      return res.status(400).render('admin/topic_form', {
        title: 'Nauja tema',
        mode: 'create',
        error: 'Pasirinkite temų grupę ir įrašykite temos pavadinimą.',
        groups,
        topic: { group_id: groupId, title, short_description: shortDescription, sort_order: sortOrder, is_active: isActive }
      });
    }

    db.prepare(
      `INSERT INTO topics (group_id, title, short_description, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?)`
    ).run(groupId, title, shortDescription || null, sortOrder, isActive);

    return res.redirect('/admin/temos');
  } catch (e) {
    return next(e);
  }
});

router.get('/temos/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    const topic = db
      .prepare('SELECT id, group_id, title, short_description, sort_order, is_active FROM topics WHERE id = ?')
      .get(id);
    if (!topic) return res.status(404).render('errors/403', { title: 'Nerasta', message: 'Tema nerasta.' });
    const groups = db
      .prepare('SELECT id, title FROM topic_groups ORDER BY sort_order ASC, title ASC')
      .all();
    return res.render('admin/topic_form', { title: 'Redaguoti temą', mode: 'edit', error: null, groups, topic });
  } catch (e) {
    return next(e);
  }
});

router.post('/temos/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const groupId = Number(req.body.group_id);
    const title = String(req.body.title || '').trim();
    const shortDescription = String(req.body.short_description || '').trim();
    const sortOrder = parseIntOrNull(req.body.sort_order) ?? 0;
    const isActive = req.body.is_active === '1' ? 1 : 0;
    const db = getDb();
    const groups = db
      .prepare('SELECT id, title FROM topic_groups ORDER BY sort_order ASC, title ASC')
      .all();

    if (!groupId || !title) {
      return res.status(400).render('admin/topic_form', {
        title: 'Redaguoti temą',
        mode: 'edit',
        error: 'Pasirinkite temų grupę ir įrašykite temos pavadinimą.',
        groups,
        topic: { id, group_id: groupId, title, short_description: shortDescription, sort_order: sortOrder, is_active: isActive }
      });
    }

    db.prepare(
      `UPDATE topics
       SET group_id = ?, title = ?, short_description = ?, sort_order = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(groupId, title, shortDescription || null, sortOrder, isActive, id);

    return res.redirect('/admin/temos');
  } catch (e) {
    return next(e);
  }
});

router.post('/temos/:id/trinti', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    db.prepare('DELETE FROM topics WHERE id = ?').run(id);
    return res.redirect('/admin/temos');
  } catch (e) {
    return next(e);
  }
});

// Teorija
router.get('/teorija', (req, res, next) => {
  try {
    const topicId = parseIntOrNull(req.query.tema);
    const db = getDb();
    const topics = db
      .prepare(
        `SELECT t.id, t.title, g.title AS group_title
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all();

    const theory = db
      .prepare(
        `SELECT tp.id, tp.title, tp.short_description, tp.updated_at, t.title AS topic_title, t.id AS topic_id
         FROM theory_pages tp
         JOIN topics t ON t.id = tp.topic_id
         WHERE (@topicId IS NULL OR t.id = @topicId)
         ORDER BY tp.updated_at DESC`
      )
      .all({ topicId });

    return res.render('admin/theory_list', { title: 'Teorija', topics, theory, topicId, q: '' });
  } catch (e) {
    return next(e);
  }
});

router.get('/teorija/nauja', (req, res, next) => {
  try {
    const db = getDb();
    const topics = db
      .prepare(
        `SELECT t.id, t.title, g.title AS group_title
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all();

    const tasks = db.prepare('SELECT id, title, difficulty FROM tasks ORDER BY difficulty ASC, title ASC').all();

    return res.render('admin/theory_form', {
      title: 'Nauja teorija',
      mode: 'create',
      error: null,
      topics,
      tasks,
      page: { topic_id: topics[0]?.id || '', title: '', short_description: '', content_markdown: '', summary: '' },
      selectedTaskIds: []
    });
  } catch (e) {
    return next(e);
  }
});

router.post('/teorija/nauja', (req, res, next) => {
  try {
    const db = getDb();
    const topics = db
      .prepare(
        `SELECT t.id, t.title, g.title AS group_title
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all();
    const tasks = db.prepare('SELECT id, title, difficulty FROM tasks ORDER BY difficulty ASC, title ASC').all();

    const topicId = Number(req.body.topic_id);
    const title = String(req.body.title || '').trim();
    const shortDescription = String(req.body.short_description || '').trim();
    const contentMarkdown = String(req.body.content_markdown || '').trim();
    const summary = String(req.body.summary || '').trim();
    const selectedTaskIds = Array.isArray(req.body.task_ids)
      ? req.body.task_ids.map((x) => Number(x)).filter((x) => Number.isFinite(x))
      : req.body.task_ids
        ? [Number(req.body.task_ids)].filter((x) => Number.isFinite(x))
        : [];

    if (!topicId || !title || !contentMarkdown) {
      return res.status(400).render('admin/theory_form', {
        title: 'Nauja teorija',
        mode: 'create',
        error: 'Pasirinkite temą ir užpildykite pavadinimą bei turinį.',
        topics,
        tasks,
        page: { topic_id: topicId, title, short_description: shortDescription, content_markdown: contentMarkdown, summary },
        selectedTaskIds
      });
    }

    const info = db
      .prepare(
        `INSERT INTO theory_pages (topic_id, title, short_description, content_markdown, summary)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(topicId, title, shortDescription || null, contentMarkdown, summary || null);

    const theoryId = info.lastInsertRowid;
    const stmtLink = db.prepare('INSERT INTO theory_task_links (theory_id, task_id) VALUES (?, ?)');
    selectedTaskIds.forEach((taskId) => stmtLink.run(theoryId, taskId));

    return res.redirect('/admin/teorija');
  } catch (e) {
    return next(e);
  }
});

router.get('/teorija/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    const page = db
      .prepare('SELECT id, topic_id, title, short_description, content_markdown, summary FROM theory_pages WHERE id = ?')
      .get(id);
    if (!page) return res.status(404).render('errors/403', { title: 'Nerasta', message: 'Teorija nerasta.' });

    const topics = db
      .prepare(
        `SELECT t.id, t.title, g.title AS group_title
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all();
    const tasks = db.prepare('SELECT id, title, difficulty FROM tasks ORDER BY difficulty ASC, title ASC').all();
    const selectedTaskIds = db
      .prepare('SELECT task_id FROM theory_task_links WHERE theory_id = ?')
      .all(id)
      .map((r) => r.task_id);

    const attachments = db
      .prepare(
        `SELECT id, original_name, mime_type, size_bytes, uploaded_at
         FROM attachments
         WHERE linked_type = 'theory' AND linked_id = ?
         ORDER BY uploaded_at DESC`
      )
      .all(id);

    return res.render('admin/theory_form', {
      title: 'Redaguoti teoriją',
      mode: 'edit',
      error: null,
      topics,
      tasks,
      page,
      selectedTaskIds,
      attachments
    });
  } catch (e) {
    return next(e);
  }
});

router.post('/teorija/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    const topics = db
      .prepare(
        `SELECT t.id, t.title, g.title AS group_title
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all();
    const tasks = db.prepare('SELECT id, title, difficulty FROM tasks ORDER BY difficulty ASC, title ASC').all();

    const topicId = Number(req.body.topic_id);
    const title = String(req.body.title || '').trim();
    const shortDescription = String(req.body.short_description || '').trim();
    const contentMarkdown = String(req.body.content_markdown || '').trim();
    const summary = String(req.body.summary || '').trim();
    const selectedTaskIds = Array.isArray(req.body.task_ids)
      ? req.body.task_ids.map((x) => Number(x)).filter((x) => Number.isFinite(x))
      : req.body.task_ids
        ? [Number(req.body.task_ids)].filter((x) => Number.isFinite(x))
        : [];

    const attachments = db
      .prepare(
        `SELECT id, original_name, mime_type, size_bytes, uploaded_at
         FROM attachments
         WHERE linked_type = 'theory' AND linked_id = ?
         ORDER BY uploaded_at DESC`
      )
      .all(id);

    if (!topicId || !title || !contentMarkdown) {
      return res.status(400).render('admin/theory_form', {
        title: 'Redaguoti teoriją',
        mode: 'edit',
        error: 'Pasirinkite temą ir užpildykite pavadinimą bei turinį.',
        topics,
        tasks,
        page: { id, topic_id: topicId, title, short_description: shortDescription, content_markdown: contentMarkdown, summary },
        selectedTaskIds,
        attachments
      });
    }

    db.prepare(
      `UPDATE theory_pages
       SET topic_id = ?, title = ?, short_description = ?, content_markdown = ?, summary = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(topicId, title, shortDescription || null, contentMarkdown, summary || null, id);

    db.prepare('DELETE FROM theory_task_links WHERE theory_id = ?').run(id);
    const stmtLink = db.prepare('INSERT INTO theory_task_links (theory_id, task_id) VALUES (?, ?)');
    selectedTaskIds.forEach((taskId) => stmtLink.run(id, taskId));

    return res.redirect('/admin/teorija');
  } catch (e) {
    return next(e);
  }
});

router.post('/teorija/:id/trinti', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    db.prepare('DELETE FROM theory_pages WHERE id = ?').run(id);
    return res.redirect('/admin/teorija');
  } catch (e) {
    return next(e);
  }
});

// Užduotys
router.get('/uzduotys', (req, res, next) => {
  try {
    const topicId = parseIntOrNull(req.query.tema);
    const difficulty = parseIntOrNull(req.query.lygis);
    const db = getDb();
    const topics = db
      .prepare(
        `SELECT t.id, t.title, g.title AS group_title
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all();

    const tasks = db
      .prepare(
        `SELECT tk.id, tk.title, tk.short_description, tk.difficulty, tk.updated_at,
                t.title AS topic_title, t.id AS topic_id
         FROM tasks tk
         JOIN topics t ON t.id = tk.topic_id
         WHERE (@topicId IS NULL OR t.id = @topicId)
           AND (@difficulty IS NULL OR tk.difficulty = @difficulty)
         ORDER BY tk.updated_at DESC`
      )
      .all({ topicId, difficulty });

    return res.render('admin/tasks_list', { title: 'Užduotys', topics, tasks, topicId, difficulty, q: '' });
  } catch (e) {
    return next(e);
  }
});

router.get('/uzduotys/nauja', (req, res, next) => {
  try {
    const db = getDb();
    const topics = db
      .prepare(
        `SELECT t.id, t.title, g.title AS group_title
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all();
    return res.render('admin/task_form', {
      title: 'Nauja užduotis',
      mode: 'create',
      error: null,
      topics,
      task: {
        topic_id: topics[0]?.id || '',
        title: '',
        short_description: '',
        difficulty: 1,
        statement: '',
        input_desc: '',
        output_desc: '',
        examples: '',
        teacher_notes: '',
        hint: '',
        tags: ''
      }
    });
  } catch (e) {
    return next(e);
  }
});

router.post('/uzduotys/nauja', (req, res, next) => {
  try {
    const db = getDb();
    const topics = db
      .prepare(
        `SELECT t.id, t.title, g.title AS group_title
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all();

    const topicId = Number(req.body.topic_id);
    const title = String(req.body.title || '').trim();
    const shortDescription = String(req.body.short_description || '').trim();
    const difficulty = parseIntOrNull(req.body.difficulty) ?? 1;
    const statement = String(req.body.statement || '').trim();
    const inputDesc = String(req.body.input_desc || '').trim();
    const outputDesc = String(req.body.output_desc || '').trim();
    const examples = String(req.body.examples || '').trim();
    const teacherNotes = String(req.body.teacher_notes || '').trim();
    const hint = String(req.body.hint || '').trim();
    const tags = String(req.body.tags || '').trim();

    if (!topicId || !title || !statement) {
      return res.status(400).render('admin/task_form', {
        title: 'Nauja užduotis',
        mode: 'create',
        error: 'Pasirinkite temą ir užpildykite pavadinimą bei sąlygą.',
        topics,
        task: {
          topic_id: topicId,
          title,
          short_description: shortDescription,
          difficulty,
          statement,
          input_desc: inputDesc,
          output_desc: outputDesc,
          examples,
          teacher_notes: teacherNotes,
          hint,
          tags
        }
      });
    }

    db.prepare(
      `INSERT INTO tasks
        (topic_id, title, short_description, difficulty, statement, input_desc, output_desc, examples, teacher_notes, hint, tags)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      topicId,
      title,
      shortDescription || null,
      difficulty,
      statement,
      inputDesc || null,
      outputDesc || null,
      examples || null,
      teacherNotes || null,
      hint || null,
      tags || null
    );

    return res.redirect('/admin/uzduotys');
  } catch (e) {
    return next(e);
  }
});

router.get('/uzduotys/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    const task = db
      .prepare(
        `SELECT id, topic_id, title, short_description, difficulty, statement, input_desc, output_desc, examples, teacher_notes, hint, tags
         FROM tasks WHERE id = ?`
      )
      .get(id);
    if (!task) return res.status(404).render('errors/403', { title: 'Nerasta', message: 'Užduotis nerasta.' });

    const topics = db
      .prepare(
        `SELECT t.id, t.title, g.title AS group_title
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all();

    const attachments = db
      .prepare(
        `SELECT id, original_name, mime_type, size_bytes, uploaded_at
         FROM attachments
         WHERE linked_type = 'task' AND linked_id = ?
         ORDER BY uploaded_at DESC`
      )
      .all(id);

    return res.render('admin/task_form', { title: 'Redaguoti užduotį', mode: 'edit', error: null, topics, task, attachments });
  } catch (e) {
    return next(e);
  }
});

router.post('/uzduotys/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    const topics = db
      .prepare(
        `SELECT t.id, t.title, g.title AS group_title
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all();

    const topicId = Number(req.body.topic_id);
    const title = String(req.body.title || '').trim();
    const shortDescription = String(req.body.short_description || '').trim();
    const difficulty = parseIntOrNull(req.body.difficulty) ?? 1;
    const statement = String(req.body.statement || '').trim();
    const inputDesc = String(req.body.input_desc || '').trim();
    const outputDesc = String(req.body.output_desc || '').trim();
    const examples = String(req.body.examples || '').trim();
    const teacherNotes = String(req.body.teacher_notes || '').trim();
    const hint = String(req.body.hint || '').trim();
    const tags = String(req.body.tags || '').trim();

    const attachments = db
      .prepare(
        `SELECT id, original_name, mime_type, size_bytes, uploaded_at
         FROM attachments
         WHERE linked_type = 'task' AND linked_id = ?
         ORDER BY uploaded_at DESC`
      )
      .all(id);

    if (!topicId || !title || !statement) {
      return res.status(400).render('admin/task_form', {
        title: 'Redaguoti užduotį',
        mode: 'edit',
        error: 'Pasirinkite temą ir užpildykite pavadinimą bei sąlygą.',
        topics,
        task: {
          id,
          topic_id: topicId,
          title,
          short_description: shortDescription,
          difficulty,
          statement,
          input_desc: inputDesc,
          output_desc: outputDesc,
          examples,
          teacher_notes: teacherNotes,
          hint,
          tags
        },
        attachments
      });
    }

    db.prepare(
      `UPDATE tasks
       SET topic_id = ?, title = ?, short_description = ?, difficulty = ?,
           statement = ?, input_desc = ?, output_desc = ?, examples = ?,
           teacher_notes = ?, hint = ?, tags = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      topicId,
      title,
      shortDescription || null,
      difficulty,
      statement,
      inputDesc || null,
      outputDesc || null,
      examples || null,
      teacherNotes || null,
      hint || null,
      tags || null,
      id
    );

    return res.redirect('/admin/uzduotys');
  } catch (e) {
    return next(e);
  }
});

router.post('/uzduotys/:id/trinti', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return res.redirect('/admin/uzduotys');
  } catch (e) {
    return next(e);
  }
});

// Failai
router.get('/failai', (req, res, next) => {
  try {
    const db = getDb();
    const files = db
      .prepare(
        `SELECT id, original_name, mime_type, size_bytes, uploaded_at, linked_type, linked_id
         FROM attachments
         ORDER BY uploaded_at DESC
         LIMIT 200`
      )
      .all();
    const theory = db.prepare('SELECT id, title FROM theory_pages ORDER BY updated_at DESC, title ASC').all();
    const tasks = db.prepare('SELECT id, title FROM tasks ORDER BY updated_at DESC, title ASC').all();
    return res.render('admin/files', { title: 'Failai', files, theory, tasks, error: null, q: '' });
  } catch (e) {
    return next(e);
  }
});

router.post('/failai/ikelti', upload.array('files', 10), (req, res, next) => {
  try {
    const linkedType = req.body.linked_type === 'task' ? 'task' : 'theory';
    const linkedId = Number(req.body.linked_id);
    if (!linkedId) {
      (req.files || []).forEach((f) => fs.unlinkSync(f.path));
      return res.status(400).redirect('/admin/failai');
    }

    const db = getDb();
    const stmt = db.prepare(
      `INSERT INTO attachments (original_name, stored_name, mime_type, size_bytes, linked_type, linked_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    (req.files || []).forEach((f) => {
      stmt.run(f.originalname, path.basename(f.filename), f.mimetype || 'application/octet-stream', f.size, linkedType, linkedId);
    });
    return res.redirect('/admin/failai');
  } catch (e) {
    return next(e);
  }
});

router.post('/failai/:id/trinti', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    const file = db.prepare('SELECT stored_name FROM attachments WHERE id = ?').get(id);
    if (file) {
      const absPath = path.join(uploadsDir, file.stored_name);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
      db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    }
    return res.redirect('/admin/failai');
  } catch (e) {
    return next(e);
  }
});

return router;
};

