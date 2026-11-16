const fs = require('fs');
const path = require('path');
const express = require('express');
const mime = require('mime-types');
const { getDb } = require('../db');

module.exports = function fileRoutes({ uploadsDir }) {
  const router = express.Router();

  router.get('/atsisiusti/:id', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const db = getDb();
      const file = db
        .prepare(
          `SELECT id, original_name, stored_name, mime_type, size_bytes
           FROM attachments
           WHERE id = ?`
        )
        .get(id);
      if (!file) {
        return res.status(404).render('errors/403', { title: 'Nerasta', message: 'Failas nerastas.' });
      }

      const absPath = path.join(uploadsDir, file.stored_name);
      if (!fs.existsSync(absPath)) {
        return res.status(404).render('errors/403', { title: 'Nerasta', message: 'Failas nerastas serveryje.' });
      }

      const ct = file.mime_type || mime.lookup(file.original_name) || 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
      return fs.createReadStream(absPath).pipe(res);
    } catch (e) {
      return next(e);
    }
  });

  return router;
};

