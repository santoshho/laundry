const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Helper functions
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// -------------------
// HOME
// -------------------
app.get('/', (req, res) => res.render('index'));

// -------------------
// LOGIN ROUTES
// -------------------
app.get('/login', (req, res) => res.render('user/login'));

app.post('/login', (req, res) => {
  const users = readJSON('users.json');
  const user = users.find(u => u.email === req.body.email && u.password === req.body.password);

  if (!user) return res.send("Invalid email or password.");
  res.redirect('/user/dashboard/' + user.id);
});

// -------------------
// PUBLIC REGISTER ROUTES
// -------------------
app.get('/register', (req, res) => res.render('user/register'));

app.post('/register', (req, res) => {
  const users = readJSON('users.json');

  const name = req.body.name.trim();
  const email = req.body.email.trim();
  const phone = req.body.phone.trim();
  const password = req.body.password.trim();

  // BLACKLIST name
  if (name.toLowerCase() === "pukar") {
    return res.send("This name is not allowed.");
  }

  // Email validation
  const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (!emailPattern.test(email)) {
    return res.send("Invalid email format.");
  }

  // Phone validation (10 digits)
  const phonePattern = /^[0-9]{10}$/;
  if (!phonePattern.test(phone)) {
    return res.send("Phone number must be exactly 10 digits.");
  }

  // Already exists?
  if (users.find(u => u.email === email)) {
    return res.send("Email already exists.");
  }

  users.push({
    id: Date.now(),
    name,
    email,
    phone,
    password
  });

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
  const orders = readJSON('orders.json').filter(o => o.userId == userId);

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
// CREATE ORDER
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
// ADMIN ROUTES
// -------------------
app.get('/admin/login', (req, res) => res.render('admin/login'));

app.post('/admin/login', (req, res) => {
  if (req.body.email === "admin@gmail.com" && req.body.password === "admin123") {
    return res.redirect('/admin/dashboard');
  }
  res.send('Invalid admin credentials');
});

app.get('/admin/dashboard', (req, res) => {
  const orders = readJSON('orders.json');
  const users = readJSON('users.json');
  const services = readJSON('services.json');

  res.render('admin/dashboard', { orders, users, services });
});

// Update Order Status
app.post('/admin/update-status/:id', (req, res) => {
  const orders = readJSON('orders.json');
  const order = orders.find(o => o.id == req.params.id);

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
