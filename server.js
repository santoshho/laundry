const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Utility functions
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// -------------------
// Home
// -------------------
app.get('/', (req, res) => {
  res.render('index');
});

// -------------------
// USER AUTH
// -------------------
app.get('/user/login', (req, res) => {
  res.render('user/login');
});

app.post('/user/login', (req, res) => {
  const users = readJSON('users.json');
  const user = users.find(u => u.email === req.body.email && u.password === req.body.password);

  if (user) {
    res.redirect('/user/dashboard/' + user.id);
  } else {
    res.send('Invalid credentials');
  }
});

app.get('/user/register', (req, res) => {
  res.render('user/register');
});

app.post('/user/register', (req, res) => {
  const users = readJSON('users.json');
  const newUser = {
    id: Date.now(),
    name: req.body.name,
    email: req.body.email,
    password: req.body.password
  };
  users.push(newUser);
  writeJSON('users.json', users);

  res.redirect('/user/login');
});

// -------------------
// USER DASHBOARD
// -------------------
app.get('/user/dashboard/:id', (req, res) => {
  const user = readJSON('users.json').find(u => u.id == req.params.id);
  const services = readJSON('services.json');
  const orders = readJSON('orders.json').filter(o => o.userId == req.params.id);

  res.render('user/dashboard', { user, services, orders });
});

// -------------------
// NEW REQUEST PAGE (important one)
// -------------------
app.get('/user/new-request/:id', (req, res) => {
  const user = readJSON('users.json').find(u => u.id == req.params.id);
  const services = readJSON('services.json');

  res.render('user/new-request', { user, services });
});

// -------------------
// SUBMIT ORDER
// -------------------
app.post('/user/submit-request', (req, res) => {
  const orders = readJSON('orders.json');

  const newOrder = {
    id: Date.now(),
    userId: req.body.userId,
    serviceId: req.body.serviceId,
    address: req.body.address,
    notes: req.body.notes,
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
app.get('/admin/login', (req, res) => {
  res.render('admin/login');
});

app.post('/admin/login', (req, res) => {
  const admin = { email: "admin@gmail.com", password: "admin123" };
  if (req.body.email === admin.email && req.body.password === admin.password) {
    res.redirect('/admin/dashboard');
  } else {
    res.send('Invalid admin credentials');
  }
});

app.get('/admin/dashboard', (req, res) => {
  const orders = readJSON('orders.json');
  const users = readJSON('users.json');
  const services = readJSON('services.json');
  res.render('admin/dashboard', { orders, users, services });
});

// -------------------
// UPDATE ORDER STATUS
// -------------------
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
// SERVER START
// -------------------
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
