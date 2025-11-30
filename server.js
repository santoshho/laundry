const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');

// -------------------
// View Engine + Middleware
// -------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// -------------------
// Session
// -------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// -------------------
// JSON Helpers
// -------------------
function readJSON(filename) {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) return null;

  try {
    const txt = fs.readFileSync(file, 'utf8');
    return txt ? JSON.parse(txt) : null;
  } catch (err) {
    console.error('JSON read error:', filename, err);
    return null;
  }
}

function writeJSON(filename, data) {
  const file = path.join(DATA_DIR, filename);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// -------------------
// Ensure Admin Exists
// -------------------
(function ensureAdmin() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

  const adminFile = path.join(DATA_DIR, 'admin.json');
  if (!fs.existsSync(adminFile)) {
    const pwd = process.env.ADMIN_PWD || 'admin';
    writeJSON('admin.json', {
      username: 'admin',
      password_hash: bcrypt.hashSync(pwd, 8),
    });
    console.log('Default admin created.');
  }
})();

// Make session user available in all pages
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Load global app data
app.use((req, res, next) => {
  res.locals.services = readJSON('services.json') || [];
  res.locals.orders = readJSON('orders.json') || [];
  res.locals.users = readJSON('users.json') || [];
  res.locals.appconfig = readJSON('config.json') || {};
  next();
});

// -------------------
// Admin Authentication
// -------------------
function requireAdmin(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/admin/login');
}

app.get('/admin/login', (req, res) => {
  res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const admin = readJSON('admin.json');
  if (!admin) return res.send('Admin not configured');

  const { username, password } = req.body;

  if (username === admin.username && bcrypt.compareSync(password, admin.password_hash)) {
    req.session.user = { username: admin.username };
    return res.redirect('/admin/dashboard');
  }

  res.render('admin/login', { error: 'Invalid username or password' });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// -------------------
// Admin Dashboard
// -------------------
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  res.render('admin/dashboard');
});

// -------------------
// Admin Data Pages
// -------------------
app.get('/admin/orders', requireAdmin, (req, res) => {
  res.render('admin/orders', { orders: readJSON('orders.json') || [] });
});

app.get('/admin/users', requireAdmin, (req, res) => {
  res.render('admin/users', { users: readJSON('users.json') || [] });
});

// -------------------
// FIXED: Request Details (Query)
// -------------------
app.get('/admin/request-details', requireAdmin, (req, res) => {
  const id = String(req.query.id);
  const orders = readJSON('orders.json') || [];

  const order = orders.find(o => String(o.id) === id);

  if (!order) return res.status(404).send('Request not found');

  res.render('admin/request-details', { order });
});

// -------------------
// FIXED: User Details
// -------------------
app.get('/admin/user-details', requireAdmin, (req, res) => {
  const id = String(req.query.id);

  const users = readJSON('users.json') || [];
  const orders = readJSON('orders.json') || [];

  const user = users.find(u => String(u.id) === id);

  res.render('admin/user-details', { user, orders });
});

// -------------------
// FIXED: Order View (Route Param)
// -------------------
app.get('/admin/order/:id', requireAdmin, (req, res) => {
  const id = String(req.params.id);
  const orders = readJSON('orders.json') || [];

  const order = orders.find(o => String(o.id) === id);

  if (!order) return res.status(404).send('Order not found');

  res.render('admin/order_view', { order });
});

// -------------------
// Update Order Status
// -------------------
app.post('/admin/order/:id/status', requireAdmin, (req, res) => {
  const id = String(req.params.id);
  const orders = readJSON('orders.json') || [];

  const order = orders.find(o => String(o.id) === id);
  if (order) {
    order.status = req.body.status || order.status;
    order.updated_at = new Date().toISOString();
    writeJSON('orders.json', orders);
  }

  res.redirect('/admin/orders');
});

// -------------------
// Order Creation + File Upload
// -------------------
const upload = multer({ dest: path.join(__dirname, 'public/uploads') });

app.post('/create-order', upload.single('attachment'), (req, res) => {
  const orders = readJSON('orders.json') || [];

  const newOrder = {
    id: Date.now().toString(),   // STRING ID FIX
    name: req.body.name,
    phone: req.body.phone,
    address: req.body.address,
    items: req.body.items,
    status: 'pending',
    created_at: new Date().toISOString(),
    attachment: req.file ? `uploads/${path.basename(req.file.path)}` : null,
  };

  orders.push(newOrder);
  writeJSON('orders.json', orders);

  res.redirect('/order-success');
});

// -------------------
// Admin Change Password
// -------------------
app.get('/admin/change-password', requireAdmin, (req, res) => {
  res.render('admin/change_password', { error: null, success: null });
});

app.post('/admin/change-password', requireAdmin, (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const admin = readJSON('admin.json');

  if (!bcrypt.compareSync(current_password, admin.password_hash))
    return res.render('admin/change_password', { error: 'Incorrect password' });

  if (new_password !== confirm_password)
    return res.render('admin/change_password', { error: 'Passwords do not match' });

  admin.password_hash = bcrypt.hashSync(new_password, 8);
  writeJSON('admin.json', admin);

  res.render('admin/change_password', { success: 'Password updated successfully' });
});

// -------------------
// User Login / Register
// -------------------
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const users = readJSON('users.json') || [];

  const user = users.find(u => u.email === email);
  if (!user)
    return res.render('login', { error: 'Invalid email or password' });

  const isValid =
    user.password === password ||
    bcrypt.compareSync(password, user.password_hash || '');

  if (!isValid)
    return res.render('login', { error: 'Invalid email or password' });

  req.session.user = {
    id: user.id,
    email: user.email,
    username: `${user.first_name} ${user.last_name}`
  };

  res.redirect('/user/dashboard');
});

app.post('/register', (req, res) => {
  const { first_name, last_name, email, phone, password, confirm_password } = req.body;

  const users = readJSON('users.json') || [];
  const errors = [];

  if (!first_name) errors.push('First name required');
  if (!last_name) errors.push('Last name required');
  if (!email) errors.push('Email required');
  if (!password) errors.push('Password required');
  if (password !== confirm_password) errors.push('Passwords do not match');
  if (users.some(u => u.email === email)) errors.push('Email already registered');

  if (errors.length > 0) return res.render('register', { errors });

  const newUser = {
    id: Date.now().toString(),  // STRING ID FIX
    first_name,
    last_name,
    email,
    phone,
    password_hash: bcrypt.hashSync(password, 8),
    created_at: new Date().toISOString()
  };

  users.push(newUser);
  writeJSON('users.json', users);

  req.session.user = {
    id: newUser.id,
    email: newUser.email,
    username: `${newUser.first_name} ${newUser.last_name}`,
  };

  res.redirect('/user/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// -------------------
// Forgot Password (Mock)
// -------------------
app.post('/forgot-password', (req, res) => {
  res.render('forgot-password', { message: 'If this email exists, a reset link has been sent.' });
});

// -------------------
// Success Page
// -------------------
app.get('/order-success', (req, res) => {
  res.send(`
    <div style="text-align:center;padding:50px;font-family:Arial">
      <h1 style="color:#28a745;">Order Submitted Successfully!</h1>
      <p>Your laundry request has been received.</p>
      <a href="/">← Back to Home</a>
    </div>
  `);
});

// -------------------
// Dynamic Page Loader
// -------------------
app.get('*', (req, res, next) => {
  let view = req.path === '/' ? 'index' : req.path.slice(1);
  if (view.endsWith('/')) view = view.slice(0, -1);

  const direct = path.join(__dirname, 'views', `${view}.ejs`);
  const nested = path.join(__dirname, 'views', view, 'index.ejs');

  if (fs.existsSync(direct)) return res.render(view);
  if (fs.existsSync(nested)) return res.render(`${view}/index`);

  next();
});

// -------------------
// Save Unknown POST Forms
// -------------------
app.post('*', (req, res) => {
  const forms = readJSON('forms.json') || [];
  forms.push({
    path: req.path,
    body: req.body,
    created_at: new Date().toISOString(),
  });
  writeJSON('forms.json', forms);

  if (req.headers.referer) return res.redirect(req.headers.referer);
  res.send('Form saved.');
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on ${PORT}`));
}

module.exports = app;
