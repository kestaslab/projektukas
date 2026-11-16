function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  return res.redirect('/prisijungimas');
}

module.exports = { requireAuth };

