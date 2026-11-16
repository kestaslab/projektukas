const path = require('path');
const { initDb, getDb } = require('../src/db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

initDb({ dataDir: DATA_DIR });
getDb().close();
// eslint-disable-next-line no-console
console.log('DB schema sukurta / atnaujinta.');

