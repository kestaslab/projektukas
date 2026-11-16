const path = require('path');
const fs = require('fs');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cookieParser = require('cookie-parser');
const csurf = require('csurf');

const { initDb } = require('./src/db');
const { injectUser } = require('./src/middlewares/injectUser');
const { injectNav } = require('./src/middlewares/injectNav');
const { requireAuth } = require('./src/middlewares/requireAuth');

const authRoutes = require('./src/routes/auth');
const appRoutes = require('./src/routes/app');
const adminRoutes = require('./src/routes/admin');
const fileRoutes = require('./src/routes/files');
const judgeRoutes = require('./src/routes/judge');

const app = express();

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.set('layout', 'layout');
app.use(expressLayouts);

app.locals.APP_NAME = 'Mokyklinė biblioteka';

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use(
  session({
    store: new SQLiteStore({ dir: DATA_DIR, db: 'sessions.sqlite' }),
    secret: process.env.SESSION_SECRET || 'pakeisk-mane-i-saugu-slaptazodi',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === '1'
    }
  })
);

initDb({ dataDir: DATA_DIR });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use('/public', express.static(path.join(__dirname, 'public')));

app.use(injectUser);
app.use(injectNav);

app.get('/', (req, res) => {
  if (req.session?.userId) return res.redirect('/app');
  return res.redirect('/prisijungimas');
});

app.use('/prisijungimas', authRoutes);

app.use(requireAuth);
app.use(
  csurf({
    cookie: false
  })
);

app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

app.use(judgeRoutes);
app.use('/app', appRoutes);
app.use('/admin', adminRoutes({ uploadsDir: UPLOADS_DIR }));
app.use('/failai', fileRoutes({ uploadsDir: UPLOADS_DIR }));

app.use((err, req, res, next) => {
  if (err && err.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('errors/403', {
      title: 'Uždrausta',
      message: 'Neteisingas saugos raktas (CSRF). Bandykite dar kartą.'
    });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).render('errors/500', { title: 'Klaida' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Serveris veikia: http://localhost:${PORT}`);
});

