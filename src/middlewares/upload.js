const crypto = require('crypto');
const path = require('path');
const multer = require('multer');

const ALLOWED_EXT = new Set(['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.pptx', '.jpg', '.jpeg', '.png', '.zip']);

function buildUpload({ uploadsDir }) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return cb(new Error('Neleistinas failo tipas.'));
    return cb(null, true);
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 25 * 1024 * 1024
    }
  });
}

module.exports = { buildUpload, ALLOWED_EXT };

