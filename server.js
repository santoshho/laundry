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

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const up = path.join(__dirname, 'uploads');
    if (!fs.existsSync(up)) fs.mkdirSync(up, { recursive: true });
    cb(null, up);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Helper
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8')); }
  catch (err) { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2), 'utf8');
}

// -------------------
// HOME  (passes services into index.ejs)
// -------------------
app.get('/', (req, res) => {
  const services = readJSON('services.json');
  res.render('index', { services });
});

// -------------------
// USER AUTH
// -------------------
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
  const users = readJSON('users.json');
  const user = users.find(u => u.email === req.body.email && u.password === req.body.password);
  if (!user) return res.render('login', { error: 'Invalid credentials' });
  // simple session-less redirect by id (if you have sessions, you can set req.session.user)
  res.redirect('/user/dashboard/' + user.id);
});

app.get('/register', (req, res) => res.render('register', { errors: [] }));
app.post('/register', (req, res) => {
  const users = readJSON('users.json');
  const first_name = (req.body.first_name || '').trim();
  const last_name = (req.body.last_name || '').trim();
  const email = (req.body.email || '').trim();
  const phone = (req.body.phone || '').trim();
  const password = req.body.password || '';
  const confirm_password = req.body.confirm_password || '';

  const errors = [];
  if (!first_name) errors.push('First name required');
  if (!last_name) errors.push('Last name required');
  if (!email) errors.push('Email required');
  if (!password) errors.push('Password required');
  if (password !== confirm_password) errors.push('Passwords do not match');
  if (users.find(u => u.email === email)) errors.push('Email already registered');

  if (errors.length) return res.render('register', { errors });

  const newUser = {
    id: Date.now(),
    first_name,
    last_name,
    email,
    phone,
    password, // plain for now (you can add bcrypt later)
    created_at: new Date().toISOString()
  };

  users.push(newUser);
  writeJSON('users.json', users);

  res.redirect('/login');
});

// -------------------
// USER DASHBOARD
// -------------------
app.get('/user/dashboard/:id', (req, res) => {
  const userId = req.params.id;
  const user = readJSON('users.json').find(u => u.id == userId);
  const services = readJSON('services.json');
  const orders = readJSON('orders.json').filter(o => String(o.userId) === String(userId));
  res.render('user/dashboard', { user, services, orders });
});

// -------------------
// NEW REQUEST PAGE
// -------------------
app.get('/user/new-request/:id', (req, res) => {
  const user = readJSON('users.json').find(u => u.id == req.params.id);
  const services = readJSON('services.json');
  res.render('user/new-request', { user, services });
});

// -------------------
// SUBMIT ORDER
// -------------------
app.post('/create-order', upload.single("attachment"), (req, res) => {
  const orders = readJSON('orders.json');
  const newOrder = {
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
  };
  orders.push(newOrder);
  writeJSON('orders.json', orders);
  res.redirect('/user/dashboard/' + req.body.userId);
});

// -------------------
// ADMIN
// -------------------
app.get('/admin/login', (req, res) => res.render('admin/login', { error: null }));
app.post('/admin/login', (req, res) => {
  if (req.body.email === "admin@gmail.com" && req.body.password === "admin123") {
    return res.redirect('/admin/dashboard');
  }
  res.render('admin/login', { error: 'Invalid admin credentials' });
});
app.get('/admin/dashboard', (req, res) => {
  const orders = readJSON('orders.json');
  const users = readJSON('users.json');
  const services = readJSON('services.json');
  res.render('admin/dashboard', { orders, users, services });
});

// Update order
app.post('/admin/update-status/:id', (req, res) => {
  const orders = readJSON('orders.json');
  const order = orders.find(o => String(o.id) === String(req.params.id));
  if (order) {
    order.status = req.body.status;
    writeJSON('orders.json', orders);
  }
  res.redirect('/admin/dashboard');
});

// -------------------
// START SERVER
// -------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
