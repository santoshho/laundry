const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');

// --- Express setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// --- Session ---
app.use(
session({
secret: process.env.SESSION_SECRET || 'change_this_secret',
resave: false,
saveUninitialized: false,
cookie: { secure: false },
})
);

// --- JSON utilities ---
function readJSON(filename) {
const p = path.join(DATA_DIR, filename);
if (!fs.existsSync(p)) return null;
try {
const content = fs.readFileSync(p, 'utf8');
return content ? JSON.parse(content) : null;
} catch (e) {
console.error('JSON Read Error', filename, e);
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

// --- Ensure admin exists ---
(function ensureAdmin() {
const admPath = path.join(DATA_DIR, 'admin.json');
if (!fs.existsSync(admPath)) {
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const pwd = process.env.ADMIN_PWD || 'admin';  
writeJSON('admin.json', {  
  username: 'admin',  
  password_hash: bcrypt.hashSync(pwd, 8),  
});  

console.log('Default admin created. Change ADMIN_PWD to override.');

}
})();

// --- Make user available to all views ---
app.use((req, res, next) => {
res.locals.user = req.session.user || null;
next();
});

// --- Load shared app data globally ---
app.use((req, res, next) => {
try {
res.locals.services = readJSON('services.json') || [];
res.locals.orders = readJSON('orders.json') || [];
res.locals.users = readJSON('users.json') || [];
res.locals.appconfig = readJSON('config.json') || {};
} catch (err) {
console.error('Global data load error:', err);
}
next();
});

// -------------------
// Admin Auth
// -------------------

app.get('/admin/login', (req, res) => {
res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
const { username, password } = req.body;
const admin = readJSON('admin.json');
if (!admin) return res.send('Admin not configured');

if (username === admin.username && bcrypt.compareSync(password, admin.password_hash)) {
req.session.user = { username: admin.username };
return res.redirect('/admin/dashboard');
}
res.render('admin/login', { error: 'Invalid username or password' });
});

app.post('/admin/logout', (req, res) => {
req.session.destroy(() => res.redirect('/'));
});

function requireAdmin(req, res, next) {
if (req.session.user) return next();
res.redirect('/admin/login');
}

// --- Admin Dashboard ---
app.get('/admin/dashboard', requireAdmin, (req, res) => {
if (fs.existsSync(path.join(__dirname, 'views/admin/dashboard.ejs'))) {
return res.render('admin/dashboard');
}
const orders = readJSON('orders.json') || [];
res.send(<h1>Admin Dashboard</h1><p>Orders: ${orders.length}</p>);
});

// -------------------
// Admin Pages
// -------------------

app.get('/admin/orders', requireAdmin, (req, res) => {
res.render('admin/orders', { orders: readJSON('orders.json') || [] });
});

app.get('/admin/users', requireAdmin, (req, res) => {
res.render('admin/users', { users: readJSON('users.json') || [] });
});

app.get('/admin/request-details', requireAdmin, (req, res) => {
const id = Number(req.query.id);
const order = (readJSON('orders.json') || []).find((o) => o.id === id);
res.render('admin/request-details', { order });
});

app.get('/admin/user-details', requireAdmin, (req, res) => {
const id = Number(req.query.id);
const users = readJSON('users.json') || [];
const orders = readJSON('orders.json') || [];
res.render('admin/user-details', {
user: users.find((u) => u.id === id),
orders,
});
});

app.get('/admin/order/:id', requireAdmin, (req, res) => {
const order = (readJSON('orders.json') || []).find(
(o) => o.id === Number(req.params.id)
);
if (!order) return res.status(404).send('Order not found');
res.render('admin/order_view', { order });
});

app.post('/admin/order/:id/status', requireAdmin, (req, res) => {
const orders = readJSON('orders.json') || [];
const o = orders.find((x) => x.id === Number(req.params.id));
if (o) {
o.status = req.body.status || o.status;
o.updated_at = new Date().toISOString();
writeJSON('orders.json', orders);
}
res.redirect('/admin/orders');
});

// -------------------
// Order Creation + Upload
// -------------------

const upload = multer({ dest: path.join(__dirname, 'public/uploads') });

app.post('/create-order', upload.single('attachment'), (req, res) => {
const orders = readJSON('orders.json') || [];

const newOrder = {
id: Date.now(),
name: req.body.name,
phone: req.body.phone,
address: req.body.address,
items: req.body.items,
status: 'pending',
created_at: new Date().toISOString(),
attachment: req.file ? uploads/${path.basename(req.file.path)} : null,
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

const user = users.find((u) => u.email === email);
if (!user)
return res.render('login', { error: 'Invalid email or password' });

const valid =
user.password === password ||
bcrypt.compareSync(password, user.password_hash || '');

if (!valid)
return res.render('login', { error: 'Invalid email or password' });

req.session.user = {
id: user.id,
email: user.email,
username: ${user.first_name} ${user.last_name},
};

res.redirect('/user/dashboard');
});

app.post('/register', (req, res) => {
const { first_name, last_name, email, phone, password, confirm_password } =
req.body;

const users = readJSON('users.json') || [];
const errors = [];

if (!first_name) errors.push('First name required');
if (!last_name) errors.push('Last name required');
if (!email) errors.push('Email required');
if (!password) errors.push('Password required');
if (password !== confirm_password) errors.push('Passwords do not match');
if (users.find((u) => u.email === email)) errors.push('Email already registered');

if (errors.length > 0) return res.render('register', { errors });

const newUser = {
id: Date.now(),
first_name,
last_name,
email,
phone,
password_hash: bcrypt.hashSync(password, 8),
created_at: new Date().toISOString(),
};

users.push(newUser);
writeJSON('users.json', users);

req.session.user = {
id: newUser.id,
email: newUser.email,
username: ${newUser.first_name} ${newUser.last_name},
};

res.redirect('/user/dashboard');
});

app.post('/logout', (req, res) => {
req.session.destroy(() => res.redirect('/'));
});

// -------------------
// Forgot Password Mock
// -------------------
app.post('/forgot-password', (req, res) => {
res.render('forgot-password', {
message: 'If this email exists, a reset link has been sent.',
});
});

// -------------------
// Success Page
// -------------------
app.get('/order-success', (req, res) => {
res.send(  <div style="text-align:center;padding:50px;font-family:Arial">   <h1 style="color:#28a745;">Order Submitted Successfully!</h1>   <p>Your laundry request has been received.</p>   <a href="/">← Back to Home</a>   </div>  );
});

// -------------------
// Dynamic EJS Page Loader
// -------------------
app.get('*', (req, res, next) => {
let p = req.path === '/' ? 'index' : req.path.slice(1);

if (p.endsWith('/')) p = p.slice(0, -1);

const direct = path.join(__dirname, 'views', ${p}.ejs);
const indexInside = path.join(__dirname, 'views', p, 'index.ejs');

if (fs.existsSync(direct)) return res.render(p);
if (fs.existsSync(indexInside)) return res.render(${p}/index);

next();
});

// -------------------
// Generic Form Saver
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
app.listen(PORT, () => console.log('Server running on', PORT));
}

module.exports = app;

