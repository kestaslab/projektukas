const path = require('path');
const { initDb, getDb } = require('../src/db');
const { hashPassword } = require('../src/utils/passwords');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

const username = String(process.env.ADMIN_USERNAME || '').trim();
const password = String(process.env.ADMIN_PASSWORD || '').trim();
const fullName = String(process.env.ADMIN_FULL_NAME || 'Admin').trim();

if (!username || !password) {
  // eslint-disable-next-line no-console
  console.log(
    'Naudojimas: ADMIN_USERNAME=admin ADMIN_PASSWORD=Slaptazodis123! ADMIN_FULL_NAME="Vardas Pavardė" npm run admin:create'
  );
  process.exit(1);
}

initDb({ dataDir: DATA_DIR });
const db = getDb();

try {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Vartotojas "${username}" jau egzistuoja (id=${existing.id}).`);
    process.exit(0);
  }

  db.prepare(
    `INSERT INTO users (username, full_name, role, password_hash, is_active)
     VALUES (?, ?, 'admin', ?, 1)`
  ).run(username, fullName || 'Admin', hashPassword(password));

  // eslint-disable-next-line no-console
  console.log(`Admin sukurtas: ${username}`);
} finally {
  db.close();
}

