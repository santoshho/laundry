

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
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

// Helper
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
// USER AUTH
// -------------------
app.get('/user/login', (req, res) => res.render('user/login'));

app.post('/user/login', (req, res) => {
const users = readJSON('users.json');
const user = users.find(u => u.email === req.body.email && u.password === req.body.password);

if (!user) return res.send("Invalid credentials");
res.redirect('/user/dashboard/' + user.id);
});

app.get('/user/register', (req, res) => res.render('user/register'));

app.post('/user/register', (req, res) => {
const users = readJSON('users.json');

users.push({
id: Date.now(),
name: req.body.name,
email: req.body.email,
password: req.body.password
});

writeJSON('users.json', users);
res.redirect('/user/login');
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
// SUBMIT ORDER (MATCHES YOUR FORM NOW)
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

// Update order
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
app.listen(3000, () => console.log("Server running on port 3000"));
