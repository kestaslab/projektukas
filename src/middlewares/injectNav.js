const { getDb } = require('../db');

function injectNav(req, res, next) {
  res.locals.navTree = null;
  if (!res.locals.currentUser) return next();

  try {
    const db = getDb();
    const groups = db
      .prepare(
        `SELECT id, title, sort_order
         FROM topic_groups
         WHERE is_active = 1
         ORDER BY sort_order ASC, title ASC`
      )
      .all();

    const topics = db
      .prepare(
        `SELECT t.id, t.group_id, t.title, t.sort_order
         FROM topics t
         JOIN topic_groups g ON g.id = t.group_id
         WHERE t.is_active = 1 AND g.is_active = 1
         ORDER BY t.sort_order ASC, t.title ASC`
      )
      .all();

    const byGroup = new Map();
    topics.forEach((t) => {
      if (!byGroup.has(t.group_id)) byGroup.set(t.group_id, []);
      byGroup.get(t.group_id).push(t);
    });

    res.locals.navTree = groups.map((g) => ({
      id: g.id,
      title: g.title,
      topics: byGroup.get(g.id) || []
    }));

    return next();
  } catch (e) {
    return next(e);
  }
}

module.exports = { injectNav };

