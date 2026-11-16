function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  if (req.method === 'GET' && /^\/app\/tema\/\d+(?:\?.*)?$/.test(req.originalUrl)) {
    req.session.returnTo = req.originalUrl;
  }
  return res.redirect('/prisijungimas');
}

module.exports = { requireAuth };
