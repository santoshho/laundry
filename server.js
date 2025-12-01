const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');

// ---------------------------
// Express Setup
// ---------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ---------------------------
// Session
// ---------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// ---------------------------
// JSON File Helpers
// ---------------------------
function readJSON(filename) {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error("Error reading:", filename, err);
    return null;
  }
}

function writeJSON(filename, data) {
  fs.writeFileSync(
    path.join(DATA_DIR, filename),
    JSON.stringify(data, null, 2),
    'utf8'
  );
}

// ---------------------------
// Ensure admin.json exists
// ---------------------------
(function () {
  const adm = path.join(DATA_DIR, 'admin.json');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

  if (!fs.existsSync(adm)) {
    const pwd = process.env.ADMIN_PWD || 'admin';
    writeJSON('admin.json', {
      username: 'admin',
      password_hash: bcrypt.hashSync(pwd, 8),
    });
    console.log("Admin created: username=admin password=admin");
  }
})();

// ---------------------------
// Global data available to all EJS pages
// ---------------------------
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.services = readJSON('services.json') || [];
  res.locals.orders = readJSON('orders.json') || [];
  res.locals.users = readJSON('users.json') || [];
  next();
});

// ---------------------------
// Admin Login
// ---------------------------
app.get('/admin/login', (req, res) => {
  res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = readJSON('admin.json');

  if (!admin) return res.send("Admin not initialized");

  if (username === admin.username &&
      bcrypt.compareSync(password, admin.password_hash)) {
    req.session.user = { username: admin.username };
    return res.redirect('/admin/dashboard');
  }

  res.render('admin/login', { error: "Invalid credentials" });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

function requireAdmin(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/admin/login');
}

// ---------------------------
// Admin Pages
// ---------------------------
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  res.render('admin/dashboard');
});

app.get('/admin/orders', requireAdmin, (req, res) => {
  res.render('admin/orders', { orders: readJSON('orders.json') || [] });
});

app.get('/admin/users', requireAdmin, (req, res) => {
  res.render('admin/users', { users: readJSON('users.json') || [] });
});

app.get('/admin/request-details', requireAdmin, (req, res) => {
  const id = Number(req.query.id);
  const order = (readJSON('orders.json') || []).find(o => o.id === id);
  res.render('admin/request-details', { order });
});

app.post('/admin/order/:id/status', requireAdmin, (req, res) => {
  const orders = readJSON('orders.json') || [];
  const o = orders.find(x => x.id === Number(req.params.id));

  if (o) {
    o.status = req.body.status;
    o.updated_at = new Date().toISOString();
    writeJSON('orders.json', orders);
  }
  res.redirect('/admin/orders');
});

// ---------------------------
// CREATE ORDER + file upload
// ---------------------------
const upload = multer({ dest: path.join(__dirname, 'public/uploads') });

// ⭐ FINAL working order creation
app.post('/create-order', upload.single('attachment'), (req, res) => {
  const orders = readJSON('orders.json') || [];

  const newOrder = {
    id: Date.now(),

    // user info
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    address: req.body.address,

    // service details
    service_type: req.body.service_type,
    weight_kg: Number(req.body.weight_kg),
    price_per_kg: Number(req.body.price_per_kg),
    total_price: Number(req.body.total_price),

    // payment
    payment_method: req.body.payment_method,

    status: "pending",
    created_at: new Date().toISOString(),
    attachment: req.file ? `uploads/${path.basename(req.file.path)}` : null
  };

  orders.push(newOrder);
  writeJSON('orders.json', orders);

  res.redirect('/order-success');
});

// ---------------------------
// User Login / Register
// ---------------------------
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const users = readJSON('users.json') || [];

  const u = users.find(e => e.email === email);
  if (!u) return res.render('login', { error: "Invalid email or password" });

  const ok = bcrypt.compareSync(password, u.password_hash);
  if (!ok) return res.render('login', { error: "Invalid email or password" });

  req.session.user = {
    id: u.id,
    email: u.email,
    username: `${u.first_name} ${u.last_name}`
  };

  res.redirect('/user/dashboard');
});

app.post('/register', (req, res) => {
  const { first_name, last_name, email, phone, password, confirm_password } = req.body;

  const users = readJSON('users.json') || [];
  const errors = [];

  if (!first_name) errors.push("First name required");
  if (!last_name) errors.push("Last name required");
  if (!email) errors.push("Email required");
  if (!password) errors.push("Password required");
  if (password !== confirm_password) errors.push("Passwords do not match");
  if (users.find(u => u.email === email)) errors.push("Email already exists");

  if (errors.length > 0) return res.render('register', { errors });

  const newUser = {
    id: Date.now(),
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
    username: `${newUser.first_name} ${newUser.last_name}`
  };

  res.redirect('/user/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------------------------
// Generic Success Page
// ---------------------------
app.get('/order-success', (req, res) => {
  res.send(`
    <div style="text-align:center;padding:50px;font-family:Arial">
      <h1 style="color:#28a745;">Order Submitted Successfully!</h1>
      <p>Your laundry request has been received.</p>
      <a href="/">← Back to Home</a>
    </div>
  `);
});

// ---------------------------
// Dynamic EJS Loader
// ---------------------------
app.get('*', (req, res, next) => {
  let page = req.path === '/' ? 'index' : req.path.slice(1);
  if (page.endsWith('/')) page = page.slice(0, -1);

  const direct = path.join(__dirname, 'views', `${page}.ejs`);
  const inside = path.join(__dirname, 'views', page, 'index.ejs');

  if (fs.existsSync(direct)) return res.render(page);
  if (fs.existsSync(inside)) return res.render(`${page}/index`);

  next();
});

// ---------------------------
// Generic POST Saver
// ---------------------------
app.post('*', (req, res) => {
  const forms = readJSON('forms.json') || [];
  forms.push({
    path: req.path,
    body: req.body,
    created_at: new Date().toISOString(),
  });
  writeJSON('forms.json', forms);

  res.redirect(req.headers.referer || '/');
});

// ---------------------------
// Server Start
// ---------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
