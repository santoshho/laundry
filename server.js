const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

function readJSON(filename){
  const p = path.join(DATA_DIR, filename);
  if(!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p,'utf8')||'null'); } catch(e){ return null; }
}
function writeJSON(filename, data){
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data,null,2),'utf8');
}

// Ensure an admin user exists (stored in data/admin.json)
// Default username: admin, password: admin (please change)
(function ensureAdmin(){
  const admPath = path.join(DATA_DIR, 'admin.json');
  if(!fs.existsSync(admPath)){
    const pwd = process.env.ADMIN_PWD || 'admin';
    const hash = bcrypt.hashSync(pwd, 8);
    const admin = { username: 'admin', password_hash: hash };
    if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    fs.writeFileSync(admPath, JSON.stringify(admin,null,2),'utf8');
    console.log('Created default admin user. Change ADMIN_PWD env var to set different password.');
  }
})();

// Middleware to expose user to views
app.use((req,res,next)=>{
  res.locals.user = req.session.user || null;
  next();
});

// Load common data into all views (services, orders, users, config)
app.use((req,res,next)=>{
  try{
    res.locals.services = readJSON('services.json') || [];
    res.locals.orders = readJSON('orders.json') || [];
    res.locals.users = readJSON('users.json') || [];
    res.locals.appconfig = readJSON('config.json') || {};
  }catch(e){
    console.error('middleware load error', e);
  }
  next();
});


// Simple admin login/logout
app.get('/admin/login', (req,res)=>{
  res.render('admin/login'); // expects views/admin/login.ejs
});
app.post('/admin/login', (req,res)=>{
  const { username, password } = req.body;
  const admin = readJSON('admin.json');
  if(!admin) return res.send('Admin not configured');
  if(username === admin.username && bcrypt.compareSync(password, admin.password_hash)){
    req.session.user = { username: admin.username };
    return res.redirect('/admin/dashboard');
  }
  res.render('admin/login', { error: 'Invalid credentials' });
});
app.post('/admin/logout', (req,res)=>{
  req.session.destroy(()=> res.redirect('/'));
});

function requireAdmin(req,res,next){
  if(req.session && req.session.user) return next();
  return res.redirect('/admin/login');
}

// Basic admin dashboard route (if converted view exists)
app.get('/admin/dashboard', requireAdmin, (req,res)=>{
  // try to render converted view at views/admin/dashboard.ejs otherwise show simple list
  if(fs.existsSync(path.join(__dirname,'views','admin','dashboard.ejs'))){
    return res.render('admin/dashboard');
  }
  const orders = readJSON('orders.json') || [];
  res.send(`<h1>Admin Dashboard</h1><p>Orders: ${orders.length}</p><a href="/admin/orders">View Orders</a>`);
});


// Simple user routes (render converted views if present)
app.get('/user/profile', (req,res)=>{ if(fs.existsSync(path.join(__dirname,'views','user','profile.ejs'))) return res.render('user/profile'); res.status(404).send('Not found'); });
app.get('/user/requests', (req,res)=>{ if(fs.existsSync(path.join(__dirname,'views','user','requests.ejs'))) return res.render('user/requests'); res.status(404).send('Not found'); });
app.get('/user/request-details', (req,res)=>{ if(fs.existsSync(path.join(__dirname,'views','user','request-details.ejs'))) return res.render('user/request-details'); res.status(404).send('Not found'); });

// Generic route: render any converted EJS view that matches URL.
// For example /user/profile -> views/user/profile.ejs
app.use((req,res,next)=>{
  // only handle GET
  if(req.method !== 'GET') return next();
  // map URL path to view file
  let p = req.path.replace(/^\//,'');
  if(!p) p = 'index';
  // remove trailing slash
  if(p.endsWith('/')) p = p.slice(0,-1);
  const viewPath = path.join(__dirname, 'views', p + '.ejs');
  if(fs.existsSync(viewPath)){
    return res.render(p.replace(/\.ejs$/,''));
  }
  // try index inside folder: e.g., /user -> views/user/index.ejs
  const viewPath2 = path.join(__dirname,'views', p, 'index.ejs');
  if(fs.existsSync(viewPath2)){
    return res.render(path.join(p,'index'));
  }
  return next();
});

// Generic POST handler: save form submissions to data/forms.json with path and body

// ------- Order management and file upload support -------

const upload = multer({ dest: path.join(__dirname, 'public', 'uploads') });

// List orders (admin)
app.get('/admin/orders', requireAdmin, (req,res)=>{
  const orders = readJSON('orders.json') || [];
  return res.render('admin/orders', { orders });
});

// Admin users route
app.get('/admin/users', requireAdmin, (req,res)=>{
  const users = readJSON('users.json') || [];
  return res.render('admin/users', { users });
});

// Admin request details route
app.get('/admin/request-details', requireAdmin, (req,res)=>{
  const id = Number(req.query.id);
  const orders = readJSON('orders.json') || [];
  const order = orders.find(o => o.id === id);
  return res.render('admin/request-details', { order });
});

// Admin user details route
app.get('/admin/user-details', requireAdmin, (req,res)=>{
  const id = Number(req.query.id);
  const users = readJSON('users.json') || [];
  const orders = readJSON('orders.json') || [];
  const user = users.find(u => u.id === id);
  return res.render('admin/user-details', { user, orders });
});

// View single order (admin)
app.get('/admin/order/:id', requireAdmin, (req,res)=>{
  const id = Number(req.params.id);
  const orders = readJSON('orders.json') || [];
  const order = orders.find(o=>o.id===id);
  if(!order) return res.status(404).send('Order not found');
  return res.render('admin/order_view', { order });
});

// Update order status (admin)
app.post('/admin/order/:id/status', requireAdmin, (req,res)=>{
  const id = Number(req.params.id);
  const orders = readJSON('orders.json') || [];
  const o = orders.find(x=>x.id===id);
  if(o){
    o.status = req.body.status || o.status;
    o.updated_at = new Date().toISOString();
    writeJSON('orders.json', orders);
  }
  res.redirect('/admin/orders');
});

// Create order with optional file upload (customer-facing)
app.post('/create-order', upload.single('attachment'), (req,res)=>{
  const orders = readJSON('orders.json') || [];
  const newOrder = {
    id: Date.now(),
    name: req.body.name || '',
    phone: req.body.phone || '',
    address: req.body.address || '',
    items: req.body.items || '',
    status: 'pending',
    created_at: new Date().toISOString(),
    attachment: req.file ? path.join('uploads', path.basename(req.file.path)) : null
  };
  orders.push(newOrder);
  writeJSON('orders.json', orders);
  res.redirect('/order-success');
});

// Admin change password
app.get('/admin/change-password', requireAdmin, (req,res)=>{
  res.render('admin/change_password');
});
app.post('/admin/change-password', requireAdmin, (req,res)=>{
  const { current_password, new_password, confirm_password } = req.body;
  if(!current_password || !new_password) return res.render('admin/change_password', { error: 'Fill fields' });
  const admin = readJSON('admin.json');
  if(!admin) return res.render('admin/change_password', { error: 'Admin not configured' });
  if(!require('bcryptjs').compareSync(current_password, admin.password_hash)){
    return res.render('admin/change_password', { error: 'Current password incorrect' });
  }
  if(new_password !== confirm_password){
    return res.render('admin/change_password', { error: 'Passwords do not match' });
  }
  const hash = require('bcryptjs').hashSync(new_password, 8);
  admin.password_hash = hash;
  writeJSON('admin.json', admin);
  res.render('admin/change_password', { success: 'Password changed' });
});
// ------- end order & upload routes -------

// User authentication routes
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const users = readJSON('users.json') || [];
  
  const user = users.find(u => u.email === email);
  if (!user) {
    return res.render('login', { error: 'Invalid email or password' });
  }
  
  // For demo purposes, we'll use simple password comparison
  // In production, use bcrypt for password hashing
  if (user.password === password || bcrypt.compareSync(password, user.password_hash || '')) {
    req.session.user = { 
      id: user.id, 
      email: user.email, 
      username: user.first_name + ' ' + user.last_name 
    };
    return res.redirect('/user/dashboard');
  }
  
  res.render('login', { error: 'Invalid email or password' });
});

app.post('/register', (req, res) => {
  const { first_name, last_name, email, phone, password, confirm_password } = req.body;
  const users = readJSON('users.json') || [];
  
  // Basic validation
  const errors = [];
  if (!first_name) errors.push('First name is required');
  if (!last_name) errors.push('Last name is required');
  if (!email) errors.push('Email is required');
  if (!password) errors.push('Password is required');
  if (password !== confirm_password) errors.push('Passwords do not match');
  
  // Check if user already exists
  if (users.find(u => u.email === email)) {
    errors.push('Email already registered');
  }
  
  if (errors.length > 0) {
    return res.render('register', { errors });
  }
  
  // Create new user
  const newUser = {
    id: Date.now(),
    first_name,
    last_name,
    email,
    phone: phone || '',
    password_hash: bcrypt.hashSync(password, 8),
    created_at: new Date().toISOString()
  };
  
  users.push(newUser);
  writeJSON('users.json', users);
  
  // Auto-login after registration
  req.session.user = { 
    id: newUser.id, 
    email: newUser.email, 
    username: newUser.first_name + ' ' + newUser.last_name 
  };
  
  res.redirect('/user/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Forgot password route (basic implementation)
app.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  const users = readJSON('users.json') || [];
  
  const user = users.find(u => u.email === email);
  if (user) {
    // In a real app, you'd send an email here
    res.render('forgot-password', { 
      message: 'If an account with that email exists, we\'ve sent a password reset link.' 
    });
  } else {
    res.render('forgot-password', { 
      message: 'If an account with that email exists, we\'ve sent a password reset link.' 
    });
  }
});

// Create success page route
app.get('/order-success', (req, res) => {
  res.send(`
    <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
      <h1 style="color: #28a745;">Order Submitted Successfully!</h1>
      <p>Your laundry request has been received and will be processed soon.</p>
      <a href="/" style="color: #007bff; text-decoration: none;">← Back to Home</a>
    </div>
  `);
});

app.post('*', (req,res)=>{
  const forms = readJSON('forms.json') || [];
  forms.push({ path: req.path, body: req.body, created_at: new Date().toISOString() });
  writeJSON('forms.json', forms);
  // redirect back or show success
  if(req.headers.referer) return res.redirect(req.headers.referer);
  res.send('Form submitted (saved).');
});

const PORT = process.env.PORT || 3000;

// Only start server if this file is run directly (not imported for testing)
if (require.main === module) {
  app.listen(PORT, ()=> console.log('Server listening on', PORT));
}

module.exports = app;