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

// Ensure an admin user exists
(function ensureAdmin(){
  const admPath = path.join(DATA_DIR, 'admin.json');
  if(!fs.existsSync(admPath)){
    const pwd = process.env.ADMIN_PWD || 'admin';
    const hash = bcrypt.hashSync(pwd, 8);
    const admin = { username: 'admin', password_hash: hash };
    if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    fs.writeFileSync(admPath, JSON.stringify(admin,null,2),'utf8');
    console.log('Created default admin user.');
  }
})();

function isAdminUser(req){
  if(!req.session || !req.session.user) return false;
  const admin = readJSON('admin.json');
  return admin && (req.session.user.username === admin.username || req.session.user.isAdmin);
}

app.use((req,res,next)=>{
  res.locals.user = req.session.user || null;
  next();
});

app.use((req,res,next)=>{
  if(req.session.notification){
    res.locals.notification = req.session.notification;
    res.locals.notificationType = req.session.notificationType || 'success';
    delete req.session.notification;
    delete req.session.notificationType;
  }
  next();
});

app.use((req,res,next)=>{
  try{
    res.locals.services = readJSON('services.json') || [];
    res.locals.orders = readJSON('orders.json') || [];
    res.locals.users = readJSON('users.json') || [];
    res.locals.appconfig = readJSON('config.json') || {};

    if(req.session.user){
      const notifications = readJSON('notifications.json') || [];
      const admin = isAdminUser(req);
      
      if(admin){
        res.locals.notificationCount =
          notifications.filter(n => n.recipient_type === 'admin' && !n.read).length;
      } else {
        res.locals.notificationCount =
          notifications.filter(n => n.recipient_type === 'user' && n.recipient_id === req.session.user.id && !n.read).length;
      }
    } else {
      res.locals.notificationCount = 0;
    }
  }catch(e){
    console.error('middleware load error', e);
  }
  next();
});


// ------------------------------------------------------
// FIXED HOME PAGE (THIS LINE FIXES YOUR INTERNAL ERROR)
// ------------------------------------------------------
app.get("/", (req, res) => {
  const services = readJSON("services.json") || [];

  const testimonials = [
    {
      name: "Rahul Sharma",
      location: "Pokhara",
      image: "https://i.pravatar.cc/150?img=11",
      message: "Super fast pickup and very clean clothes!"
    },
    {
      name: "Anita KC",
      location: "Butwal",
      image: "https://i.pravatar.cc/150?img=32",
      message: "Affordable prices and reliable service."
    },
    {
      name: "Sujan Lama",
      location: "Kathmandu",
      image: "https://i.pravatar.cc/150?img=45",
      message: "Pickup and delivery on time every time!"
    }
  ];

  res.render("index", { services, testimonials });
});


// ------------------------------------------------------
// Simple admin login/logout
// ------------------------------------------------------
app.get('/admin/login', (req,res)=>{
  res.render('admin/login');
});
app.post('/admin/login', (req,res)=>{
  const { username, password } = req.body;
  const admin = readJSON('admin.json');
  if(!admin) return res.send('Admin not configured');
  if(username === admin.username && bcrypt.compareSync(password, admin.password_hash)){
    req.session.user = { username: admin.username, isAdmin: true, id: 'admin' };
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

app.get('/admin/dashboard', requireAdmin, (req,res)=>{
  if(fs.existsSync(path.join(__dirname,'views','admin','dashboard.ejs'))){
    return res.render('admin/dashboard');
  }
  const orders = readJSON('orders.json') || [];
  res.send(`<h1>Admin Dashboard</h1><p>Orders: ${orders.length}</p>`);
});


// ------------------------------------------------------
// USER ROUTES
// ------------------------------------------------------
app.get('/user/profile', (req,res)=>{
  if(fs.existsSync(path.join(__dirname,'views','user','profile.ejs')))
    return res.render('user/profile');
  res.status(404).send('Not found');
});
app.get('/user/requests', (req,res)=>{
  if(fs.existsSync(path.join(__dirname,'views','user','requests.ejs')))
    return res.render('user/requests');
  res.status(404).send('Not found');
});
app.get('/user/request-details', (req,res)=>{
  if(fs.existsSync(path.join(__dirname,'views','user','request-details.ejs')))
    return res.render('user/request-details');
  res.status(404).send('Not found');
});

// AUTO RENDER
app.use((req,res,next)=>{
  if(req.method !== 'GET') return next();
  let p = req.path.replace(/^\//,'');
  if(!p) p = 'index';
  if(p.endsWith('/')) p = p.slice(0,-1);
  const v1 = path.join(__dirname, 'views', p + '.ejs');
  if(fs.existsSync(v1)) return res.render(p);
  const v2 = path.join(__dirname,'views', p, 'index.ejs');
  if(fs.existsSync(v2)) return res.render(path.join(p,'index'));
  return next();
});


// ------------------------------------------------------
// ORDERS & UPLOADS
// ------------------------------------------------------
const upload = multer({ dest: path.join(__dirname, 'public', 'uploads') });

app.get('/admin/orders', requireAdmin, (req,res)=>{
  const orders = readJSON('orders.json') || [];
  return res.render('admin/orders', { orders });
});

app.get('/admin/users', requireAdmin, (req,res)=>{
  const users = readJSON('users.json') || [];
  return res.render('admin/users', { users });
});

app.get('/admin/request-details', requireAdmin, (req,res)=>{
  const id = Number(req.query.id);
  const orders = readJSON('orders.json') || [];
  const order = orders.find(o => o.id === id);
  return res.render('admin/request-details', { order });
});

app.get('/admin/user-details', requireAdmin, (req,res)=>{
  const id = Number(req.query.id);
  const users = readJSON('users.json') || [];
  const orders = readJSON('orders.json') || [];
  const user = users.find(u => u.id === id);
  return res.render('admin/user-details', { user, orders });
});

app.get('/admin/order/:id', requireAdmin, (req,res)=>{
  const id = Number(req.params.id);
  const orders = readJSON('orders.json') || [];
  const order = orders.find(o=>o.id===id);
  if(!order) return res.status(404).send('Order not found');
  return res.render('admin/order_view', { order });
});

app.post('/admin/order/:id/status', requireAdmin, (req,res)=>{
  const id = Number(req.params.id);
  const orders = readJSON('orders.json') || [];
  const o = orders.find(x=>x.id===id);
  if(o){
    o.status = req.body.status || o.status;
    o.updated_at = new Date().toISOString();
    writeJSON('orders.json', orders);

    const notifications = readJSON('notifications.json') || [];
    const msg = {
      id: Date.now(),
      recipient_type: 'user',
      recipient_id: o.user_id,
      type: 'info',
      title: 'Order Status Updated',
      message: `Order #${o.id} updated to ${o.status}`,
      order_id: o.id,
      read: false,
      created_at: new Date().toISOString()
    };
    notifications.push(msg);
    writeJSON('notifications.json', notifications);

    req.session.notification = 'Order status updated successfully';
    req.session.notificationType = 'success';
  }
  res.redirect('/admin/orders');
});

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
    attachment: req.file ? path.join('uploads', path.basename(req.file.path)) : null,
    user_id: req.session.user ? req.session.user.id : null
  };
  orders.push(newOrder);
  writeJSON('orders.json', orders);

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

  req.session.notification = 'Your order has been submitted successfully!';
  req.session.notificationType = 'success';

  res.redirect('/order-success');
});


// ------------------------------------------------------
// USER AUTH
// ------------------------------------------------------
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const users = readJSON('users.json') || [];

  const user = users.find(u => u.email === email);
  if (!user) return res.render('login', { error: 'Invalid email or password' });

  if (user.password === password || bcrypt.compareSync(password, user.password_hash || '')) {
    req.session.user = { id: user.id, email: user.email, username: user.first_name + ' ' + user.last_name };
    return res.redirect('/user/dashboard');
  }

  res.render('login', { error: 'Invalid email or password' });
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

  if (users.find(u => u.email === email)) errors.push('Email already registered');

  if (errors.length > 0) return res.render('register', { errors });

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

  req.session.user = { id: newUser.id, email: newUser.email, username: newUser.first_name + ' ' + newUser.last_name };

  res.redirect('/user/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.post('/forgot-password', (req, res) => {
  res.render('forgot-password', {
    message: 'If email exists, a reset link has been sent.'
  });
});


// ------------------------------------------------------
// NOTIFICATIONS API
// ------------------------------------------------------
app.get('/api/notifications', (req, res) => {
  const notifications = readJSON('notifications.json') || [];
  let filtered = [];

  if(req.session.user){
    const admin = isAdminUser(req);
    if(admin){
      filtered = notifications.filter(n => n.recipient_type === 'admin' && !n.read);
    } else {
      filtered = notifications.filter(n => n.recipient_type === 'user' && n.recipient_id === req.session.user.id && !n.read);
    }
  }
  filtered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

  res.json({ notifications: filtered });
});

app.post('/api/notifications/:id/read', (req, res) => {
  const notifications = readJSON('notifications.json') || [];
  const n = notifications.find(n => n.id === Number(req.params.id));

  if(n){
    n.read = true;
    n.read_at = new Date().toISOString();
    writeJSON('notifications.json', notifications);
    return res.json({ success: true });
  }

  res.status(404).json({ success: false });
});


// ------------------------------------------------------
app.get('/order-success', (req, res) => {
  res.render('order-success');
});


app.post('*', (req,res)=>{
  const forms = readJSON('forms.json') || [];
  forms.push({ path: req.path, body: req.body, created_at: new Date().toISOString() });
  writeJSON('forms.json', forms);
  if(req.headers.referer) return res.redirect(req.headers.referer);
  res.send('Form submitted.');
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, ()=> console.log('Server listening on', PORT));
}
module.exports = app;
