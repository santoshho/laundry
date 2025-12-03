// server.js (production-style, full)
const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');

// --- Basic hardening / logging ---
app.use(helmet());
app.use(morgan('dev'));

// --- View & static ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// --- Body parsers ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Session ---
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // set true in prod with HTTPS
  })
);

// --- Utilities: ensure data dir ---
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
ensureDataDir();

// --- JSON helpers (safe-ish) ---
function readJSON(filename) {
  try {
    const p = path.join(DATA_DIR, filename);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('readJSON error', filename, err);
    return null;
  }
}

function writeJSON(filename, data) {
  try {
    ensureDataDir();
    const p = path.join(DATA_DIR, filename);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('writeJSON error', filename, err);
    return false;
  }
}

// --- Ensure default files exist (admin, pricing, users, orders) ---
(function bootstrap() {
  const admPath = path.join(DATA_DIR, 'admin.json');
  if (!fs.existsSync(admPath)) {
    const pwd = process.env.ADMIN_PWD || 'admin';
    const admin = { username: 'admin', password_hash: bcrypt.hashSync(pwd, 8) };
    writeJSON('admin.json', admin);
    console.log('Created default admin.json');
  }
  if (!readJSON('pricing.json')) writeJSON('pricing.json', []);
  if (!readJSON('users.json')) writeJSON('users.json', []);
  if (!readJSON('orders.json')) writeJSON('orders.json', []);
  if (!readJSON('notifications.json')) writeJSON('notifications.json', []);
})();

// --- Auth helpers ---
function isAdminUser(req) {
  if (!req.session || !req.session.user) return false;
  const admin = readJSON('admin.json');
  if (!admin) return false;
  return req.session.user && (req.session.user.username === admin.username || req.session.user.isAdmin);
}

function requireAdmin(req, res, next) {
  if (isAdminUser(req)) return next();
  return res.redirect('/admin/login');
}

// --- Make some data available to all views ---
app.use((req, res, next) => {
  try {
    res.locals.user = req.session.user || null;
    res.locals.services = readJSON('pricing.json') || [];
    res.locals.orders = readJSON('orders.json') || [];
    res.locals.users = readJSON('users.json') || [];
    res.locals.notificationCount = 0;

    if (req.session.user) {
      const notifications = readJSON('notifications.json') || [];
      if (isAdminUser(req)) {
        res.locals.notificationCount = notifications.filter(n => n.recipient_type === 'admin' && !n.read).length;
      } else {
        res.locals.notificationCount = notifications.filter(n => n.recipient_type === 'user' && n.recipient_id === req.session.user.id && !n.read).length;
      }
    }
  } catch (err) {
    console.error('global locals error', err);
  }
  next();
});

// --- Routes ---

// HOME
app.get('/', (req, res) => {
  const services = readJSON('pricing.json') || [];
  const testimonials = [
    { name: 'Rahul Sharma', location: 'Pokhara', image: 'https://i.pravatar.cc/150?img=11', message: 'Super fast pickup and very clean clothes!' },
    { name: 'Anita KC', location: 'Butwal', image: 'https://i.pravatar.cc/150?img=32', message: 'Affordable prices and reliable service.' },
    { name: 'Sujan Lama', location: 'Kathmandu', image: 'https://i.pravatar.cc/150?img=45', message: 'Pickup and delivery on time every time!' }
  ];
  res.render('index', { services, testimonials });
});

// --- AUTH: Register / Login (user) ---
app.get('/register', (req, res) => res.render('register', { errors: null }));
app.post('/register', (req, res) => {
  const { first_name, last_name, email, phone, password, confirm_password } = req.body;
  const errors = [];
  if (!first_name) errors.push('First name required');
  if (!last_name) errors.push('Last name required');
  if (!email) errors.push('Email required');
  if (!password) errors.push('Password required');
  if (password !== confirm_password) errors.push('Passwords do not match');

  const users = readJSON('users.json') || [];
  if (users.find(u => u.email === email)) errors.push('Email already registered');

  if (errors.length) return res.render('register', { errors });

  const newUser = {
    id: Date.now(),
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    email: email.trim(),
    phone: phone || '',
    password_hash: bcrypt.hashSync(password, 8),
    created_at: new Date().toISOString()
  };

  users.push(newUser);
  writeJSON('users.json', users);

  req.session.user = { id: newUser.id, email: newUser.email, username: `${newUser.first_name} ${newUser.last_name}` };
  req.session.notification = 'Welcome! Your account is created';
  res.redirect('/');
});

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const users = readJSON('users.json') || [];
  const user = users.find(u => u.email === String(email).trim());

  if (!user) return res.render('login', { error: 'Invalid email or password' });

  if (!bcrypt.compareSync(password, user.password_hash || '')) return res.render('login', { error: 'Invalid email or password' });

  req.session.user = { id: user.id, email: user.email, username: `${user.first_name} ${user.last_name}` };
  res.redirect('/user/dashboard');
});

app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// --- USER DASHBOARD (minimal) ---
app.get('/user/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const orders = (readJSON('orders.json') || []).filter(o => String(o.user_id) === String(req.session.user.id) || !o.user_id && o.name === req.session.user.username);
  res.render('user/dashboard', { orders });
});

// --- ADMIN AUTH ---
app.get('/admin/login', (req, res) => res.render('admin/login', { error: null }));
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = readJSON('admin.json');
  if (!admin) return res.render('admin/login', { error: 'Admin not configured' });

  if (username === admin.username && bcrypt.compareSync(password, admin.password_hash)) {
    req.session.user = { username: admin.username, isAdmin: true, id: 'admin' };
    return res.redirect('/admin/dashboard');
  }
  res.render('admin/login', { error: 'Invalid credentials' });
});

app.post('/admin/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// --- ADMIN PAGES ---
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  const orders = readJSON('orders.json') || [];
  res.render('admin/dashboard', { orders });
});

// Pricing management
app.get('/admin/pricing', requireAdmin, (req, res) => {
  const pricing = readJSON('pricing.json') || [];
  res.render('admin/pricing', { pricing });
});

// Save (add or update) — matches your pricing.ejs modal POST action
app.post('/admin/pricing/save', requireAdmin, (req, res) => {
  const pricing = readJSON('pricing.json') || [];
  const id = req.body.id ? Number(req.body.id) : null;
  const name = (req.body.name || '').trim();
  const price = Number(req.body.price) || 0;
  const unit = req.body.unit || 'per kg';

  if (!name || price <= 0) {
    req.session.notification = 'Name and valid price are required';
    req.session.notificationType = 'danger';
    return res.redirect('/admin/pricing');
  }

  if (id) {
    const idx = pricing.findIndex(p => Number(p.id) === Number(id));
    if (idx !== -1) {
      pricing[idx].name = name;
      pricing[idx].price = price;
      pricing[idx].unit = unit;
      pricing[idx].updated_at = new Date().toISOString();
      writeJSON('pricing.json', pricing);
      req.session.notification = 'Pricing updated';
      req.session.notificationType = 'success';
      return res.redirect('/admin/pricing');
    }
    // if id provided but not found, fallthrough to create new
  }

  const newItem = { id: Date.now(), name, price, unit, created_at: new Date().toISOString() };
  pricing.push(newItem);
  writeJSON('pricing.json', pricing);
  req.session.notification = 'New pricing added';
  req.session.notificationType = 'success';
  res.redirect('/admin/pricing');
});

// Delete pricing — supports both modal form and form action /admin/pricing/delete/:id
app.post('/admin/pricing/delete/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  let pricing = readJSON('pricing.json') || [];
  pricing = pricing.filter(p => Number(p.id) !== id);
  writeJSON('pricing.json', pricing);
  req.session.notification = 'Pricing removed';
  req.session.notificationType = 'success';
  res.redirect('/admin/pricing');
});

// Also allow POST /admin/pricing with action=delete (backwards compat)
app.post('/admin/pricing', requireAdmin, (req, res) => {
  const action = req.body.action;
  let pricing = readJSON('pricing.json') || [];
  if (action === 'delete') {
    const id = Number(req.body.id);
    pricing = pricing.filter(p => p.id !== id);
    writeJSON('pricing.json', pricing);
    req.session.notification = 'Pricing removed';
    req.session.notificationType = 'success';
  } else if (action === 'add') {
    pricing.push({
      id: Date.now(),
      name: (req.body.name || '').trim(),
      price: Number(req.body.price) || 0,
      unit: req.body.unit || 'per kg',
      created_at: new Date().toISOString()
    });
    writeJSON('pricing.json', pricing);
    req.session.notification = 'Pricing added';
    req.session.notificationType = 'success';
  }
  res.redirect('/admin/pricing');
});

// --- Orders, create-order (public) ---
const upload = multer({ dest: path.join(__dirname, 'public', 'uploads') });

app.get('/order/create', (req, res) => {
  const pricing = readJSON('pricing.json') || [];
  res.render('order-create', { pricing });
});

app.post('/create-order', upload.single('attachment'), (req, res) => {
  const orders = readJSON('orders.json') || [];
  const pricing = readJSON('pricing.json') || [];
  const selected = pricing.find(p => String(p.id) === String(req.body.pricing_id));
  const total = (selected && req.body.weight) ? Number(selected.price) * Number(req.body.weight) : 0;

  const newOrder = {
    id: Date.now(),
    name: req.body.name || '',
    phone: req.body.phone || '',
    address: req.body.address || '',
    weight: req.body.weight || '',
    pricing_id: req.body.pricing_id || null,
    service_name: selected ? selected.name : '',
    total_price: total,
    status: 'pending',
    attachment: req.file ? path.join('uploads', path.basename(req.file.path)) : null,
    created_at: new Date().toISOString(),
    user_id: req.session.user ? req.session.user.id : null
  };

  orders.push(newOrder);
  writeJSON('orders.json', orders);

  // push admin notification
  const notifications = readJSON('notifications.json') || [];
  notifications.push({
    id: Date.now(),
    recipient_type: 'admin',
    type: 'info',
    title: 'New Order',
    message: `New order #${newOrder.id}`,
    order_id: newOrder.id,
    read: false,
    created_at: new Date().toISOString()
  });
  writeJSON('notifications.json', notifications);

  req.session.notification = 'Order submitted';
  req.session.notificationType = 'success';
  res.redirect('/order-success');
});

// Admin orders view
app.get('/admin/orders', requireAdmin, (req, res) => {
  const orders = readJSON('orders.json') || [];
  res.render('admin/orders', { orders });
});

// update status
app.post('/admin/order/:id/status', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const orders = readJSON('orders.json') || [];
  const o = orders.find(x => x.id === id);
  if (o) {
    o.status = req.body.status || o.status;
    o.updated_at = new Date().toISOString();
    if (!o.status_history) o.status_history = [];
    o.status_history.push({ status: o.status, note: req.body.note || '', updated_by: req.session.user ? req.session.user.username : 'admin', at: new Date().toISOString() });
    writeJSON('orders.json', orders);

    // notify user
    const notifications = readJSON('notifications.json') || [];
    notifications.push({
      id: Date.now(),
      recipient_type: 'user',
      recipient_id: o.user_id,
      type: 'info',
      title: 'Order status updated',
      message: `Order #${o.id} updated to ${o.status}`,
      order_id: o.id,
      read: false,
      created_at: new Date().toISOString()
    });
    writeJSON('notifications.json', notifications);
  }
  res.redirect('/admin/orders');
});

// simple endpoints for order-success / misc
app.get('/order-success', (req, res) => res.render('order-success'));

// API notifications
app.get('/api/notifications', (req, res) => {
  const notifications = readJSON('notifications.json') || [];
  let filtered = [];
  if (req.session.user) {
    if (isAdminUser(req)) filtered = notifications.filter(n => n.recipient_type === 'admin' && !n.read);
    else filtered = notifications.filter(n => n.recipient_type === 'user' && n.recipient_id === req.session.user.id && !n.read);
  }
  filtered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ notifications: filtered });
});

app.post('/api/notifications/:id/read', (req, res) => {
  const id = Number(req.params.id);
  const notifications = readJSON('notifications.json') || [];
  const n = notifications.find(x => x.id === id);
  if (n) {
    n.read = true;
    n.read_at = new Date().toISOString();
    writeJSON('notifications.json', notifications);
    return res.json({ success: true });
  }
  res.status(404).json({ success: false });
});

// catch-all POST logger for unexpected forms (keeps behavior you had)
app.post('*', (req, res) => {
  const forms = readJSON('forms.json') || [];
  forms.push({ path: req.path, body: req.body, created_at: new Date().toISOString() });
  writeJSON('forms.json', forms);
  return res.redirect(req.headers.referer || '/');
});

// --- central error handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  // friendly page for users
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  res.status(500).render('500', { error: err });
});

// start
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
}
module.exports = app;
