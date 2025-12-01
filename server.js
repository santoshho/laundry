// server.js - robust replacement
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Ensure data directory + default files exist so view rendering won't crash
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ensureJSON = (filename, defaultContent) => {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(defaultContent, null, 2), 'utf8');
    console.log(`Created missing ${filename}`);
  }
};

// default seed files
ensureJSON('services.json', [
  { id: 1, name: "Regular Wash & Dry", description: "Standard washing and drying service for everyday clothes", price: 500, status: "active" },
  { id: 2, name: "Dry Cleaning", description: "Professional dry cleaning for delicate and formal wear", price: 1500, status: "active" },
  { id: 3, name: "Express Service", description: "Same-day wash and dry service for urgent needs", price: 800, status: "active" },
  { id: 4, name: "Delicate Care", description: "Special care for delicate fabrics and premium garments", price: 1200, status: "active" }
]);
ensureJSON('users.json', []);       // users storage
ensureJSON('orders.json', []);      // orders / requests
ensureJSON('forms.json', []);       // generic saved forms

// Helper safe JSON read/write
function readJSON(file) {
  try {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('readJSON error', file, err);
    return [];
  }
}
function writeJSON(file, data) {
  try {
    fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('writeJSON error', file, err);
  }
}

// configure upload folder
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage });

// simple request logger (helpful on Render logs)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// make some globals available in every render (safely)
app.use((req, res, next) => {
  res.locals.appName = 'Laundry Management System';
  // load these on every request so templates can use them
  res.locals.services = readJSON('services.json') || [];
  res.locals.users = readJSON('users.json') || [];
  res.locals.orders = readJSON('orders.json') || [];
  next();
});

// --- ROUTES (keeps your original routes & names) ---

// HOME - pass services to index.ejs
app.get('/', (req, res) => {
  try {
    const services = readJSON('services.json') || [];
    return res.render('index', { services });
  } catch (err) {
    console.error('Render index error', err);
    return res.status(500).send('Internal server error (index). Check logs.');
  }
});

// AUTH: show login/register pages (templates must exist at views/login.ejs and views/register.ejs)
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});
app.post('/login', (req, res) => {
  const users = readJSON('users.json') || [];
  const u = users.find(x => x.email === req.body.email && x.password === req.body.password);
  if (!u) return res.render('login', { error: 'Invalid credentials' });
  // simple redirect by id (no session)
  res.redirect(`/user/dashboard/${u.id}`);
});

app.get('/register', (req, res) => res.render('register', { errors: [] }));
app.post('/register', (req, res) => {
  const users = readJSON('users.json') || [];
  const first_name = (req.body.first_name || '').trim();
  const last_name = (req.body.last_name || '').trim();
  const email = (req.body.email || '').trim();
  const phone = (req.body.phone || '').trim();
  const password = req.body.password || '';
  const confirm = req.body.confirm_password || '';

  const errors = [];
  if (!first_name) errors.push('First name required');
  if (!last_name) errors.push('Last name required');
  if (!email) errors.push('Email required');
  if (!password) errors.push('Password required');
  if (password !== confirm) errors.push('Passwords do not match');
  if (users.find(u => u.email === email)) errors.push('Email already registered');

  if (errors.length) return res.render('register', { errors });

  const newUser = { id: Date.now(), first_name, last_name, email, phone, password, created_at: new Date().toISOString() };
  users.push(newUser);
  writeJSON('users.json', users);
  res.redirect('/login');
});

// User dashboard (expects views/user/dashboard.ejs)
app.get('/user/dashboard/:id', (req, res) => {
  try {
    const userId = req.params.id;
    const users = readJSON('users.json') || [];
    const user = users.find(u => String(u.id) === String(userId));
    if (!user) return res.status(404).send('User not found');

    const orders = (readJSON('orders.json') || []).filter(o => String(o.userId) === String(userId));
    const services = readJSON('services.json') || [];
    return res.render('user/dashboard', { user, services, orders });
  } catch (err) {
    console.error('Dashboard render error', err);
    return res.status(500).send('Internal server error (dashboard). Check logs.');
  }
});

// New request page (needs views/user/new-request.ejs)
// Note: route uses /user/new-request/:id to match your template earlier (so the link should be /user/new-request/USERID)
app.get('/user/new-request/:id', (req, res) => {
  try {
    const userId = req.params.id;
    const users = readJSON('users.json') || [];
    const user = users.find(u => String(u.id) === String(userId));
    if (!user) return res.status(404).send('User not found');

    const services = readJSON('services.json') || [];
    return res.render('user/new-request', { user, services });
  } catch (err) {
    console.error('new-request render error', err);
    return res.status(500).send('Internal server error (new-request). Check logs.');
  }
});

// Create order - matches your current new-request form name attributes
app.post('/create-order', upload.single('attachment'), (req, res) => {
  try {
    const orders = readJSON('orders.json') || [];
    const newOrder = {
      id: Date.now(),
      userId: req.body.userId || req.body.user_id || null,
      name: req.body.name || '',
      phone: req.body.phone || '',
      address: req.body.address || '',
      serviceId: req.body.service_id || req.body.service || null,
      kg: req.body.kg || req.body.weight || null,
      totalPrice: req.body.total_price || null,
      items: req.body.items || '',
      attachment: req.file ? `/uploads/${req.file.filename}` : null,
      status: "pending",
      created_at: new Date().toISOString()
    };
    orders.push(newOrder);
    writeJSON('orders.json', orders);
    const redirectTo = newOrder.userId ? `/user/dashboard/${newOrder.userId}` : '/';
    return res.redirect(redirectTo);
  } catch (err) {
    console.error('create-order error', err);
    return res.status(500).send('Internal server error (create-order). Check logs.');
  }
});

// ADMIN routes (keep as before)
app.get('/admin/login', (req, res) => res.render('admin/login', { error: null }));
app.post('/admin/login', (req, res) => {
  // default admin credentials: admin@gmail.com / admin123
  if (req.body.email === 'admin@gmail.com' && req.body.password === 'admin123') return res.redirect('/admin/dashboard');
  return res.render('admin/login', { error: 'Invalid admin credentials' });
});
app.get('/admin/dashboard', (req, res) => {
  try {
    const orders = readJSON('orders.json') || [];
    const users = readJSON('users.json') || [];
    const services = readJSON('services.json') || [];
    return res.render('admin/dashboard', { orders, users, services });
  } catch (err) {
    console.error('admin dashboard render error', err);
    return res.status(500).send('Internal server error (admin). Check logs.');
  }
});
app.post('/admin/update-status/:id', (req, res) => {
  try {
    const id = req.params.id;
    const orders = readJSON('orders.json') || [];
    const order = orders.find(o => String(o.id) === String(id));
    if (order) {
      order.status = req.body.status || order.status;
      writeJSON('orders.json', orders);
    }
    return res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('admin update-status error', err);
    return res.status(500).send('Internal server error (admin update). Check logs.');
  }
});

// generic page loader: if EJS exists for path, render it (safely)
app.get('*', (req, res, next) => {
  try {
    // map /some/page -> views/some/page.ejs or views/some.ejs
    let p = req.path === '/' ? 'index' : req.path.slice(1);
    if (p.endsWith('/')) p = p.slice(0, -1);

    const direct = path.join(__dirname, 'views', `${p}.ejs`);
    const indexInside = path.join(__dirname, 'views', p, 'index.ejs');

    if (fs.existsSync(direct)) return res.render(p);
    if (fs.existsSync(indexInside)) return res.render(`${p}/index`);
    return next();
  } catch (err) {
    console.error('dynamic render error', err);
    return res.status(500).send('Internal server error (dynamic). Check logs.');
  }
});

// fallback 404
app.use((req, res) => {
  res.status(404).send('Not found');
});

// global error handler (prints stack to logs)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Internal server error (unexpected). Check logs.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
