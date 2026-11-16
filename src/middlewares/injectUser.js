const { getDb } = require('../db');

function injectUser(req, res, next) {
  res.locals.currentUser = null;
  if (!req.session?.userId) return next();

  try {
    const db = getDb();
    const user = db
      .prepare('SELECT id, username, full_name, role, is_active FROM users WHERE id = ?')
      .get(req.session.userId);

    if (!user || user.is_active !== 1) {
      req.session.destroy(() => {});
      return next();
    }

    res.locals.currentUser = user;
    return next();
  } catch (e) {
    return next(e);
  }
}

module.exports = { injectUser };

