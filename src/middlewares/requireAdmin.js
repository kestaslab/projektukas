function requireAdmin(req, res, next) {
  const user = res.locals.currentUser;
  if (user && user.role === 'admin') return next();
  return res.status(403).render('errors/403', {
    title: 'Uždrausta',
    message: 'Ši dalis skirta tik administratoriui.'
  });
}

module.exports = { requireAdmin };

