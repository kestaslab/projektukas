const express = require('express');
const { getDb } = require('../db');
const { verifyPassword } = require('../utils/passwords');

const router = express.Router();

router.get('/', (req, res) => {
  if (req.session?.userId) return res.redirect('/app');
  return res.render('auth/login', { title: 'Prisijungimas', error: null, username: '' });
});

router.post('/', (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).render('auth/login', {
        title: 'Prisijungimas',
        error: 'Įveskite vartotojo vardą ir slaptažodį.',
        username
      });
    }

    const db = getDb();
    const user = db
      .prepare('SELECT id, username, full_name, role, password_hash, is_active FROM users WHERE username = ?')
      .get(username);

    if (!user || user.is_active !== 1) {
      return res.status(401).render('auth/login', {
        title: 'Prisijungimas',
        error: 'Neteisingas prisijungimas arba paskyra išjungta.',
        username
      });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).render('auth/login', {
        title: 'Prisijungimas',
        error: 'Neteisingas prisijungimas arba paskyra išjungta.',
        username
      });
    }

    req.session.userId = user.id;
    return res.redirect('/app');
  } catch (e) {
    return next(e);
  }
});

module.exports = router;

