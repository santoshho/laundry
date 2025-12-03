// server.js
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
  try {
    const content = fs.readFileSync(p, 'utf8') || 'null';
    return JSON.parse(content);
  } catch(e){
    console.error(`readJSON parse error for ${filename}:`, e);
    return null;
  }
}

function writeJSON(filename, data){
  try {
    if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data,null,2),'utf8');
  } catch(e){
    console.error(`writeJSON error for ${filename}:`, e);
  }
}

// Ensure admin exists
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
  if(!admin) return false;
  return (req.session.user.username === admin.username) || !!req.session.user.isAdmin;
}

app.use((req,res,next)=>{
  // Provide admin nav links so admin dashboard view can render them (if you modify the dashboard template)
  res.locals.adminLinks = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/services', label: 'Services' },
    { href: '/admin/pricing', label: 'Manage Pricing' },
    { href: '/admin/orders', label: 'Orders' },
    { href: '/admin/users', label: 'Users' }
  ];

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
          notifications.filter(n =>
            n.recipient_type === 'user' &&
            n.recipient_id === req.session.user.id &&
            !n.read
          ).length;
      }
    } else {
      res.locals.notificationCount = 0;
    }

  } catch(e){
    console.error('middleware load error', e);
  }
  next();
});

// ------------------------------------------------------
// HOME PAGE
// ------------------------------------------------------
app.get("/", (req, res) => {
  const servicesAll = readJSON("services.json") || [];

  const services = (servicesAll && Array.isArray(servicesAll))
    ? servicesAll.filter(s => s.available !== false)
    : [];

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
// ADMIN LOGIN
// ------------------------------------------------------
app.get('/admin/login', (req,res)=> res.render('admin/login'));

app.post('/admin/login', (req,res)=>{
  const { username, password } = req.body;
  const admin = readJSON('admin.json');

  if(!admin){
    return res.render('admin/login', { error: 'Admin not configured' });
  }

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
  if(isAdminUser(req)) return next();
  return res.redirect('/admin/login');
}

// ------------------------------------------------------
// ADMIN DASHBOARD
// ------------------------------------------------------
app.get('/admin/dashboard', requireAdmin, (req,res)=>{
  if(fs.existsSync(path.join(__dirname,'views','admin','dashboard.ejs')))
    return res.render('admin/dashboard');

  const orders = readJSON('orders.json') || [];
  // Simple fallback admin page with link to pricing
  const html = `
    <h1>Admin Dashboard</h1>
    <p>Orders: ${orders.length}</p>
    <p><a href="/admin/pricing">Manage Pricing</a></p>
    <p><a href="/admin/services">Manage Services</a></p>
    <p><a href="/admin/orders">View Orders</a></p>
  `;
  res.send(html);
});

// ------------------------------------------------------
// ADMIN SERVICES (existing feature)
// ------------------------------------------------------
app.get('/admin/services', requireAdmin, (req, res) => {
  const services = readJSON('services.json') || [];
  if(fs.existsSync(path.join(__dirname,'views','admin','services.ejs'))){
    return res.render('admin/services', { services });
  }
  // fallback
  let html = '<h1>Services</h1><ul>';
  services.forEach((s, idx) => {
    html += `<li>${s.name} - ${s.available === false ? '<strong>Unavailable</strong>' : '<strong>Available</strong>'} - <form style="display:inline" method="POST" action="/admin/service/${s.id || idx}/toggle"><button type="submit">Toggle</button></form></li>`;
  });
  html += '</ul><a href="/admin/dashboard">Back</a>';
  res.send(html);
});

app.post('/admin/service/:id/toggle', requireAdmin, (req, res) => {
  const services = readJSON('services.json') || [];
  const sid = req.params.id;

  let found = services.find(s => String(s.id) === String(sid));
  if(!found){
    const idx = Number(sid);
    if(!isNaN(idx) && services[idx]) found = services[idx];
  }

  if(found){
    found.available = !(found.available === true);
    writeJSON('services.json', services);

    req.session.notification = `Service "${found.name}" availability updated`;
    req.session.notificationType = 'success';
  } else {
    req.session.notification = 'Service not found';
    req.session.notificationType = 'danger';
  }
  return res.redirect('/admin/services');
});

// ------------------------------------------------------
//  ✅ STEP 3 — ADD PRICING MANAGEMENT (NEW)
// ------------------------------------------------------
// GET pricing page
app.get("/admin/pricing", requireAdmin, (req, res) => {
  // pricing_list kept for backwards-compatible EJS that expects pricing_list
  const pricing = readJSON("pricing.json") || [];
  const pricing_list = pricing;
  if(fs.existsSync(path.join(__dirname,'views','admin','pricing.ejs'))){
    return res.render("admin/pricing", { pricing, pricing_list });
  }
  // fallback
  let html = '<h1>Pricing</h1><ul>';
  pricing.forEach(p => {
    html += `<li>${p.name} - ${p.price} ${p.unit || ''} 
      <form style="display:inline" method="POST" action="/admin/pricing/${p.id}/delete"><button type="submit">Delete</button></form>
    </li>`;
  });
  html += `</ul><a href="/admin/dashboard">Back</a>`;
  res.send(html);
});

// POST handler to create / update / delete using the modal form
app.post("/admin/pricing", requireAdmin, (req, res) => {
  // expected fields:
  // action = update_pricing | delete_pricing
  // pricing_id (optional), service_type (or name), price_per_kg (or price), description, status
  const action = req.body.action || '';
  let pricing = readJSON("pricing.json") || [];

  if(action === 'update_pricing'){
    // Normalize incoming fields (handle names used in EJS)
    const id = req.body.pricing_id ? Number(req.body.pricing_id) : null;
    const name = (req.body.service_type || req.body.name || '').trim();
    // price may be posted as price_per_kg or price
    const priceRaw = req.body.price_per_kg || req.body.price || req.body.price_raw || '0';
    const price = Number(priceRaw) || 0;
    const description = req.body.description || '';
    const status = req.body.status || 'active';
    const unit = req.body.unit || 'per kg';

    if(!name || price <= 0){
      req.session.notification = 'Service name and valid price are required.';
      req.session.notificationType = 'danger';
      return res.redirect('/admin/pricing');
    }

    if(id){
      // update existing
      const idx = pricing.findIndex(p => Number(p.id) === Number(id));
      if(idx !== -1){
        pricing[idx].name = name;
        pricing[idx].price = price;
        pricing[idx].description = description;
        pricing[idx].status = status;
        pricing[idx].unit = unit;
        pricing[idx].updated_at = new Date().toISOString();
        writeJSON('pricing.json', pricing);
        req.session.notification = 'Pricing updated successfully.';
        req.session.notificationType = 'success';
        return res.redirect('/admin/pricing');
      } else {
        // id provided but not found -> create new fallback
      }
    }

    // create new
    const newItem = {
      id: Date.now(),
      name,
      price,
      unit,
      description,
      status,
      created_at: new Date().toISOString()
    };
    pricing.push(newItem);
    writeJSON('pricing.json', pricing);
    req.session.notification = 'New service pricing added.';
    req.session.notificationType = 'success';
    return res.redirect('/admin/pricing');
  }

  if(action === 'delete_pricing'){
    const id = Number(req.body.pricing_id || req.body.id || 0);
    if(!id){
      req.session.notification = 'Invalid pricing id';
      req.session.notificationType = 'danger';
      return res.redirect('/admin/pricing');
    }
    pricing = pricing.filter(p => Number(p.id) !== id);
    writeJSON('pricing.json', pricing);
    req.session.notification = 'Pricing deleted.';
    req.session.notificationType = 'success';
    return res.redirect('/admin/pricing');
  }

  // unknown action — fallback: redirect
  return res.redirect('/admin/pricing');
});

// convenience delete route (used by fallback or explicit form)
app.post("/admin/pricing/:id/delete", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  let pricing = readJSON("pricing.json") || [];
  pricing = pricing.filter(p => Number(p.id) !== id);
  writeJSON('pricing.json', pricing);
  req.session.notification = 'Pricing item removed!';
  req.session.notificationType = 'success';
  res.redirect('/admin/pricing');
});

// ------------------------------------------------------
// USER ROUTES (existing)
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

// fixed
app.get('/user/request-details', (req,res)=>{
  const id = Number(req.query.id);
  const orders = readJSON('orders.json') || [];
  const order = orders.find(o => o.id === id);

  if(fs.existsSync(path.join(__dirname,'views','user','request-details.ejs')))
    return res.render('user/request-details', { order });

  res.status(404).send('Not found');
});

// ------------------------------------------------------
// USER ORDER TRACKING
// ------------------------------------------------------
app.get('/user/order/:id/tracking', (req, res) => {
  const id = Number(req.params.id);
  const orders = readJSON('orders.json') || [];
  const order = orders.find(o => o.id === id);

  if(!order) return res.status(404).send('Order not found');

  if(fs.existsSync(path.join(__dirname,'views','user','order-tracking.ejs')))
    return res.render('user/order-tracking', { order });

  res.json({ order });
});

// ----------------------- AUTO RENDER -------------------
app.use((req,res,next)=>{
  if(req.method !== 'GET') return next();
  let p = req.path.replace(/^\/+/,'');
  if(!p) p = 'index';
  if(p.endsWith('/')) p = p.slice(0,-1);

  const file1 = path.join(__dirname,'views', p + '.ejs');
  const file2 = path.join(__dirname,'views', p, "index.ejs");

  if(fs.existsSync(file1)) return res.render(p);
  if(fs.existsSync(file2)) return res.render(path.join(p,'index'));
  next();
});

// ------------------------------------------------------
// ORDERS + UPLOADS
// ------------------------------------------------------
const upload = multer({ dest: path.join(__dirname, 'public', 'uploads') });

app.get('/admin/orders', requireAdmin, (req,res)=>{
  const orders = readJSON('orders.json') || [];
  res.render('admin/orders', { orders });
});

app.get('/admin/users', requireAdmin, (req,res)=>{
  const users = readJSON('users.json') || [];
  res.render('admin/users', { users });
});

app.get('/admin/request-details', requireAdmin, (req,res)=>{
  const id = Number(req.query.id);
  const orders = readJSON('orders.json') || [];
  const order = orders.find(o => o.id === id);
  res.render('admin/request-details', { order });
});

app.get('/admin/user-details', requireAdmin, (req,res)=>{
  const id = Number(req.query.id);
  const users = readJSON('users.json') || [];
  const orders = readJSON('orders.json') || [];
  const user = users.find(u => u.id === id);
  res.render('admin/user-details', { user, orders });
});

app.get('/admin/order/:id', requireAdmin, (req,res)=>{
  const id = Number(req.params.id);
  const orders = readJSON('orders.json') || [];
  const order = orders.find(o=>o.id===id);
  if(!order) return res.status(404).send('Order not found');
  res.render('admin/order_view', { order });
});

// STATUS UPDATE
app.post('/admin/order/:id/status', requireAdmin, (req,res)=>{
  const id = Number(req.params.id);
  const orders = readJSON('orders.json') || [];
  const o = orders.find(x=>x.id===id);

  if(o){
    const newStatus = req.body.status || o.status;
    o.status = newStatus;
    o.updated_at = new Date().toISOString();

    o.status_history = o.status_history || [];
    o.status_history.push({
      status: newStatus,
      note: req.body.note || '',
      updated_by: req.session.user ? (req.session.user.username || req.session.user.id) : 'system',
      at: new Date().toISOString()
    });

    writeJSON('orders.json', orders);

    const notifications = readJSON('notifications.json') || [];
    notifications.push({
      id: Date.now(),
      recipient_type: 'user',
      recipient_id: o.user_id,
      type: 'info',
      title: 'Order Status Updated',
      message: `Order #${o.id} updated to ${o.status}`,
      order_id: o.id,
      read: false,
      created_at: new Date().toISOString()
    });
    writeJSON('notifications.json', notifications);
  }

  res.redirect('/admin/orders');
});

// CREATE ORDER
app.post('/create-order', upload.single('attachment'), (req,res)=>{
  const orders = readJSON('orders.json') || [];
  const services = readJSON('services.json') || [];

  const serviceId = req.body.service_id || null;
  if(serviceId){
    const s = services.find(x => String(x.id) === String(serviceId));
    if(s && s.available === false){
      req.session.notification = 'Selected service is unavailable.';
      req.session.notificationType = 'danger';
      return res.redirect(req.headers.referer || '/');
    }
  }

  const newOrder = {
    id: Date.now(),
    name: req.body.name || '',
    phone: req.body.phone || '',
    address: req.body.address || '',
    items: req.body.items || '',
    service_id: req.body.service_id || null,
    status: 'pending',
    created_at: new Date().toISOString(),
    attachment: req.file ? path.join('uploads', path.basename(req.file.path)) : null,
    user_id: req.session.user ? req.session.user.id : null,
    status_history: [
      {
        status: 'pending',
        note: 'Order created',
        updated_by: req.session.user ? (req.session.user.username || req.session.user.id) : 'guest',
        at: new Date().toISOString()
      }
    ]
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
  if (!user)
    return res.render('login', { error: 'Invalid email or password' });

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

app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.post('/forgot-password', (req, res) => {
  res.render('forgot-password', { message: 'If email exists, a reset link has been sent.' });
});

// ------------------------------------------------------
// NOTIFICATIONS
// ------------------------------------------------------
app.get('/api/notifications', (req, res) => {
  const notifications = readJSON('notifications.json') || [];
  let filtered = [];

  if(req.session.user){
    const admin = isAdminUser(req);
    if(admin){
      filtered = notifications.filter(n => n.recipient_type === 'admin' && !n.read);
    } else {
      filtered = notifications.filter(n =>
        n.recipient_type === 'user' &&
        n.recipient_id === req.session.user.id &&
        !n.read
      );
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
  forms.push({
    path: req.path,
    body: req.body,
    created_at: new Date().toISOString()
  });
  writeJSON('forms.json', forms);

  return res.redirect(req.headers.referer || '/');
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, ()=> console.log('Server listening on', PORT));
}

module.exports = app;
