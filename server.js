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

// ---------------------------
// UPLOAD CONFIG
// ---------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const up = path.join(__dirname, 'uploads');
    if (!fs.existsSync(up)) fs.mkdirSync(up, { recursive: true });
    cb(null, up);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// ---------------------------
// HELPERS
// ---------------------------
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2));
}

// ---------------------------
// HOME PAGE
// ---------------------------
app.get('/', (req, res) => {
  const services = readJSON('services.json');
  res.render('index', { services });
});

// ---------------------------
// USER AUTH
// ---------------------------
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const users = readJSON('users.json');
  const user = users.find(
    u => u.email === req.body.email && u.password === req.body.password
  );

  if (!user) {
    return res.render('login', { error: 'Invalid email or password' });
  }

  res.redirect('/user/dashboard/' + user.id);
});

app.get('/register', (req, res) => {
  res.render('register', { errors: [] });
});

app.post('/register', (req, res) => {
  const users = readJSON('users.json');

  const first = req.body.first_name?.trim();
  const last = req.body.last_name?.trim();
  const email = req.body.email?.trim();
  const phone = req.body.phone?.trim();
  const pass = req.body.password;
  const repeat = req.body.confirm_password;

  const errors = [];

  if (!first) errors.push('First name required');
  if (!last) errors.push('Last name required');
  if (!email) errors.push('Email required');
  if (!pass) errors.push('Password required');
  if (pass !== repeat) errors.push('Passwords do not match');
  if (users.find(u => u.email === email)) errors.push('Email already registered');

  if (errors.length) {
    return res.render('register', { errors });
  }

  users.push({
    id: Date.now(),
    first_name: first,
    last_name: last,
    email,
    phone,
    password: pass,
    created_at: new Date().toISOString()
  });

  writeJSON('users.json', users);
  res.redirect('/login');
});

// ---------------------------
// DASHBOARD
// ---------------------------
app.get('/user/dashboard/:id', (req, res) => {
  const userId = req.params.id;
  const users = readJSON('users.json');
  const user = users.find(u => String(u.id) === String(userId));

  const services = readJSON('services.json');
  const orders = readJSON('orders.json').filter(o => String(o.userId) === String(userId));

  res.render('user/dashboard', { user, services, orders });
});

// ---------------------------
// NEW REQUEST PAGE (OLD ORIGINAL VERSION)
// ---------------------------
app.get('/user/new-request', (req, res) => {
  const services = readJSON('services.json');
  res.render('user/new-request', { services });
});

// ---------------------------
// CREATE ORDER
// ---------------------------
app.post('/create-order', upload.single("attachment"), (req, res) => {
  const orders = readJSON('orders.json');

  orders.push({
    id: Date.now(),
    userId: req.body.userId,
    name: req.body.name,
    phone: req.body.phone,
    address: req.body.address,
    serviceId: req.body.service_id,
    kg: req.body.kg,
    totalPrice: req.body.total_price,
    items: req.body.items,
    attachment: req.file ? req.file.filename : null,
    status: "Pending",
    date: new Date().toISOString()
  });

  writeJSON('orders.json', orders);

  res.redirect('/user/dashboard/' + req.body.userId);
});

// ---------------------------
// ADMIN
// ---------------------------
app.get('/admin/login', (req, res) => {
  res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
  if (req.body.email === "admin@gmail.com" && req.body.password === "admin123") {
    return res.redirect('/admin/dashboard');
  }
  res.render('admin/login', { error: "Invalid Admin Credentials" });
});

app.get('/admin/dashboard', (req, res) => {
  const orders = readJSON('orders.json');
  const users = readJSON('users.json');
  const services = readJSON('services.json');
  res.render('admin/dashboard', { orders, users, services });
});

// UPDATE ORDER
app.post('/admin/update-status/:id', (req, res) => {
  const orders = readJSON('orders.json');
  const order = orders.find(o => String(o.id) === String(req.params.id));

  if (order) {
    order.status = req.body.status;
    writeJSON('orders.json', orders);
  }

  res.redirect('/admin/dashboard');
});

// ---------------------------
// SERVER
// ---------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
