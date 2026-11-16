const express = require('express');
const { getDb } = require('../db');
const { renderMarkdown } = require('../utils/markdown');

const router = express.Router();

router.post('/atsijungti', (req, res) => {
  req.session.destroy(() => res.redirect('/prisijungimas'));
});

router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const latestTheory = db
      .prepare(
        `SELECT tp.id, tp.title, tp.updated_at, t.title AS topic_title
         FROM theory_pages tp
         JOIN topics t ON t.id = tp.topic_id
         ORDER BY tp.updated_at DESC
         LIMIT 5`
      )
      .all();

    const latestTasks = db
      .prepare(
        `SELECT tk.id, tk.title, tk.updated_at, tk.difficulty, t.title AS topic_title
         FROM tasks tk
         JOIN topics t ON t.id = tk.topic_id
         ORDER BY tk.updated_at DESC
         LIMIT 5`
      )
      .all();

    return res.render('app/dashboard', { title: 'Pradžia', latestTheory, latestTasks, q: '' });
  } catch (e) {
    return next(e);
  }
});

router.get('/temu-grupes', (req, res, next) => {
  try {
    const db = getDb();
    const groups = db
      .prepare(
        `SELECT id, title, description, sort_order, is_active
         FROM topic_groups
         WHERE is_active = 1
         ORDER BY sort_order ASC, title ASC`
      )
      .all();
    return res.render('app/groups', { title: 'Temų grupės', groups, q: '' });
  } catch (e) {
    return next(e);
  }
});

router.get('/temos', (req, res, next) => {
  try {
    const groupId = req.query.grupe ? Number(req.query.grupe) : null;
    const db = getDb();
    const groups = db
      .prepare(`SELECT id, title FROM topic_groups WHERE is_active = 1 ORDER BY sort_order ASC, title ASC`)
      .all();

    const topics = db
      .prepare(
        `SELECT t.id, t.title, t.short_description, t.sort_order, g.title AS group_title, g.id AS group_id
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         WHERE t.is_active = 1 AND g.is_active = 1
           AND (@groupId IS NULL OR g.id = @groupId)
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all({ groupId });

    return res.render('app/topics', { title: 'Temos', groups, topics, groupId, q: '' });
  } catch (e) {
    return next(e);
  }
});

router.get('/tema/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    const topic = db
      .prepare(
        `SELECT t.*, g.title AS group_title, g.id AS group_id
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         WHERE t.id = ? AND t.is_active = 1 AND g.is_active = 1`
      )
      .get(id);
    if (!topic) return res.status(404).render('errors/403', { title: 'Nerasta', message: 'Tema nerasta.' });

    const theory = db
      .prepare(`SELECT id, title, short_description, updated_at FROM theory_pages WHERE topic_id = ? ORDER BY title ASC`)
      .all(id);
    const tasks = db
      .prepare(
        `SELECT id, title, short_description, difficulty, updated_at
         FROM tasks
         WHERE topic_id = ?
         ORDER BY difficulty ASC, title ASC`
      )
      .all(id);

    return res.render('app/topic', { title: topic.title, topic, theory, tasks, q: '' });
  } catch (e) {
    return next(e);
  }
});

router.get('/teorija', (req, res, next) => {
  try {
    const topicId = req.query.tema ? Number(req.query.tema) : null;
    const q = String(req.query.q || '').trim();
    const db = getDb();
    const topics = db
      .prepare(
        `SELECT t.id, t.title
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         WHERE t.is_active = 1 AND g.is_active = 1
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all();

    const like = q ? `%${q}%` : null;
    const theory = db
      .prepare(
        `SELECT tp.id, tp.title, tp.short_description, tp.updated_at, t.title AS topic_title, t.id AS topic_id
         FROM theory_pages tp
         JOIN topics t ON t.id = tp.topic_id
         JOIN topic_groups g ON g.id = t.group_id
         WHERE t.is_active = 1 AND g.is_active = 1
           AND (@topicId IS NULL OR t.id = @topicId)
           AND (@like IS NULL OR tp.title LIKE @like OR tp.short_description LIKE @like OR tp.content_markdown LIKE @like OR tp.summary LIKE @like)
         ORDER BY tp.updated_at DESC`
      )
      .all({ topicId, like });

    return res.render('app/theory_list', { title: 'Teorija', topics, theory, topicId, q });
  } catch (e) {
    return next(e);
  }
});

router.get('/teorija/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    const page = db
      .prepare(
        `SELECT tp.*, t.title AS topic_title, t.id AS topic_id
         FROM theory_pages tp
         JOIN topics t ON t.id = tp.topic_id
         JOIN topic_groups g ON g.id = t.group_id
         WHERE tp.id = ? AND t.is_active = 1 AND g.is_active = 1`
      )
      .get(id);
    if (!page) return res.status(404).render('errors/403', { title: 'Nerasta', message: 'Teorija nerasta.' });

    const links = db
      .prepare(
        `SELECT tk.id, tk.title, tk.difficulty
         FROM theory_task_links l
         JOIN tasks tk ON tk.id = l.task_id
         WHERE l.theory_id = ?
         ORDER BY tk.difficulty ASC, tk.title ASC`
      )
      .all(id);

    const attachments = db
      .prepare(
        `SELECT id, original_name, mime_type, size_bytes, uploaded_at
         FROM attachments
         WHERE linked_type = 'theory' AND linked_id = ?
         ORDER BY uploaded_at DESC`
      )
      .all(id);

    const contentHtml = renderMarkdown(page.content_markdown);
    return res.render('app/theory_detail', {
      title: page.title,
      page,
      contentHtml,
      links,
      attachments,
      q: ''
    });
  } catch (e) {
    return next(e);
  }
});

router.get('/uzduotys', (req, res, next) => {
  try {
    const topicId = req.query.tema ? Number(req.query.tema) : null;
    const difficulty = req.query.lygis ? Number(req.query.lygis) : null;
    const q = String(req.query.q || '').trim();
    const db = getDb();

    const topics = db
      .prepare(
        `SELECT t.id, t.title
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         WHERE t.is_active = 1 AND g.is_active = 1
         ORDER BY g.sort_order ASC, g.title ASC, t.sort_order ASC, t.title ASC`
      )
      .all();

    const like = q ? `%${q}%` : null;
    const tasks = db
      .prepare(
        `SELECT tk.id, tk.title, tk.short_description, tk.difficulty, tk.updated_at, t.title AS topic_title, t.id AS topic_id
         FROM tasks tk
         JOIN topics t ON t.id = tk.topic_id
         JOIN topic_groups g ON g.id = t.group_id
         WHERE t.is_active = 1 AND g.is_active = 1
           AND (@topicId IS NULL OR t.id = @topicId)
           AND (@difficulty IS NULL OR tk.difficulty = @difficulty)
           AND (@like IS NULL OR tk.title LIKE @like OR tk.short_description LIKE @like OR tk.statement LIKE @like OR tk.tags LIKE @like)
         ORDER BY tk.updated_at DESC`
      )
      .all({ topicId, difficulty, like });

    return res.render('app/tasks_list', { title: 'Užduotys', topics, tasks, topicId, difficulty, q });
  } catch (e) {
    return next(e);
  }
});

router.get('/uzduotis/:id', (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const db = getDb();
    const task = db
      .prepare(
        `SELECT tk.*, t.title AS topic_title, t.id AS topic_id
         FROM tasks tk
         JOIN topics t ON t.id = tk.topic_id
         JOIN topic_groups g ON g.id = t.group_id
         WHERE tk.id = ? AND t.is_active = 1 AND g.is_active = 1`
      )
      .get(id);
    if (!task) return res.status(404).render('errors/403', { title: 'Nerasta', message: 'Užduotis nerasta.' });

    const attachments = db
      .prepare(
        `SELECT id, original_name, mime_type, size_bytes, uploaded_at
         FROM attachments
         WHERE linked_type = 'task' AND linked_id = ?
         ORDER BY uploaded_at DESC`
      )
      .all(id);

    const relatedTheory = db
      .prepare(
        `SELECT tp.id, tp.title
         FROM theory_task_links l
         JOIN theory_pages tp ON tp.id = l.theory_id
         WHERE l.task_id = ?
         ORDER BY tp.title ASC`
      )
      .all(id);

    return res.render('app/task_detail', { title: task.title, task, attachments, relatedTheory, q: '' });
  } catch (e) {
    return next(e);
  }
});

router.get('/paieska', (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const db = getDb();
    if (!q) return res.render('app/search', { title: 'Paieška', q, theory: [], tasks: [] });

    const like = `%${q}%`;
    const theory = db
      .prepare(
        `SELECT tp.id, tp.title, tp.short_description, tp.updated_at, t.title AS topic_title
         FROM theory_pages tp
         JOIN topics t ON t.id = tp.topic_id
         JOIN topic_groups g ON g.id = t.group_id
         WHERE t.is_active = 1 AND g.is_active = 1
           AND (tp.title LIKE ? OR tp.short_description LIKE ? OR tp.content_markdown LIKE ? OR tp.summary LIKE ?)
         ORDER BY tp.updated_at DESC
         LIMIT 50`
      )
      .all(like, like, like, like);

    const tasks = db
      .prepare(
        `SELECT tk.id, tk.title, tk.short_description, tk.updated_at, tk.difficulty, t.title AS topic_title
         FROM tasks tk
         JOIN topics t ON t.id = tk.topic_id
         JOIN topic_groups g ON g.id = t.group_id
         WHERE t.is_active = 1 AND g.is_active = 1
           AND (tk.title LIKE ? OR tk.short_description LIKE ? OR tk.statement LIKE ? OR tk.tags LIKE ?)
         ORDER BY tk.updated_at DESC
         LIMIT 50`
      )
      .all(like, like, like, like);

    return res.render('app/search', { title: 'Paieška', q, theory, tasks });
  } catch (e) {
    return next(e);
  }
});

module.exports = router;

