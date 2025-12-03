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

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

/* ---------------------- JSON READ & WRITE ---------------------- */
function readJSON(filename) {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) return null;
  try {
    const content = fs.readFileSync(p, 'utf8') || 'null';
    return JSON.parse(content);
  } catch (e) {
    console.error(`readJSON parse error for ${filename}:`, e);
    return null;
  }
}

function writeJSON(filename, data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    fs.writeFileSync(
      path.join(DATA_DIR, filename),
      JSON.stringify(data, null, 2),
      'utf8'
    );
  } catch (e) {
    console.error(`writeJSON error for ${filename}:`, e);
  }
}

/* ---------------------- ENSURE ADMIN ---------------------- */
(function ensureAdmin() {
  const admPath = path.join(DATA_DIR, 'admin.json');
  if (!fs.existsSync(admPath)) {
    const pwd = process.env.ADMIN_PWD || 'admin';
    const hash = bcrypt.hashSync(pwd, 8);
    const admin = { username: 'admin', password_hash: hash };
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    fs.writeFileSync(admPath, JSON.stringify(admin, null, 2), 'utf8');
    console.log('Created default admin user.');
  }
})();

function isAdminUser(req) {
  if (!req.session || !req.session.user) return false;
  const admin = readJSON('admin.json');
  if (!admin) return false;
  return (
    req.session.user.username === admin.username || !!req.session.user.isAdmin
  );
}

/* ---------------------- GLOBAL LOCALS ---------------------- */
app.use((req, res, next) => {
  res.locals.adminLinks = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/services', label: 'Services' },
    { href: '/admin/pricing', label: 'Manage Pricing' },
    { href: '/admin/orders', label: 'Orders' },
    { href: '/admin/users', label: 'Users' },
  ];

  res.locals.user = req.session.user || null;
  next();
});

app.use((req, res, next) => {
  if (req.session.notification) {
    res.locals.notification = req.session.notification;
    res.locals.notificationType = req.session.notificationType || 'success';
    delete req.session.notification;
    delete req.session.notificationType;
  }
  next();
});

/* ---------------------- PRELOAD JSON ---------------------- */
app.use((req, res, next) => {
  try {
    res.locals.services = readJSON('services.json') || [];
    res.locals.orders = readJSON('orders.json') || [];
    res.locals.users = readJSON('users.json') || [];
    res.locals.appconfig = readJSON('config.json') || {};

    if (req.session.user) {
      const notifications = readJSON('notifications.json') || [];
      const admin = isAdminUser(req);

      if (admin) {
        res.locals.notificationCount = notifications.filter(
          (n) => n.recipient_type === 'admin' && !n.read
        ).length;
      } else {
        res.locals.notificationCount = notifications.filter(
          (n) =>
            n.recipient_type === 'user' &&
            n.recipient_id === req.session.user.id &&
            !n.read
        ).length;
      }
    } else {
      res.locals.notificationCount = 0;
    }
  } catch (e) {
    console.error('middleware load error', e);
  }
  next();
});

/* ---------------------- HOME PAGE ---------------------- */
app.get('/', (req, res) => {
  const servicesAll = readJSON('services.json') || [];

  const services =
    servicesAll && Array.isArray(servicesAll)
      ? servicesAll.filter((s) => s.available !== false)
      : [];

  const testimonials = [
    {
      name: 'Krish Regmi',
      location: 'Pokhara',
      image: 'https://i.pravatar.cc/150?img=11',
      message: 'Super fast pickup and very clean clothes!',
    },
    {
      name: 'Pukar Rai',
      location: 'Butwal',
      image: 'https://i.pravatar.cc/150?img=32',
      message: 'Affordable prices and reliable service.',
    },
  ];

  res.render('index', { services, testimonials });
});

/* ---------------------- ADMIN LOGIN ---------------------- */
app.get('/admin/login', (req, res) => res.render('admin/login'));

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = readJSON('admin.json');

  if (!admin) {
    return res.render('admin/login', { error: 'Admin not configured' });
  }

  if (
    username === admin.username &&
    bcrypt.compareSync(password, admin.password_hash)
  ) {
    req.session.user = {
      username: admin.username,
      isAdmin: true,
      id: 'admin',
    };
    return res.redirect('/admin/dashboard');
  }

  res.render('admin/login', { error: 'Invalid credentials' });
});

app.post('/admin/logout', (req, res) =>
  req.session.destroy(() => res.redirect('/'))
);

function requireAdmin(req, res, next) {
  if (isAdminUser(req)) return next();
  return res.redirect('/admin/login');
}

/* ---------------------- ADMIN DASHBOARD ---------------------- */
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  return res.render('admin/dashboard');
});

/* ---------------------- ADMIN SERVICES ---------------------- */
app.get('/admin/services', requireAdmin, (req, res) => {
  const services = readJSON('services.json') || [];
  res.render('admin/services', { services });
});

app.post('/admin/service/:id/toggle', requireAdmin, (req, res) => {
  const services = readJSON('services.json') || [];
  const sid = req.params.id;

  let found = services.find((s) => String(s.id) === String(sid));

  if (found) {
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

/* ---------------------- PRICING ---------------------- */
app.get('/admin/pricing', requireAdmin, (req, res) => {
  const pricing = readJSON('pricing.json') || [];
  res.render('admin/pricing', { pricing });
});

app.post('/admin/pricing', requireAdmin, (req, res) => {
  const { action } = req.body;
  let pricing = readJSON('pricing.json') || [];

  if (action === 'add') {
    const name = req.body.name.trim();
    const price = Number(req.body.price);
    const unit = req.body.unit || 'per kg';

    pricing.push({
      id: Date.now(),
      name,
      price,
      unit,
      created_at: new Date().toISOString(),
    });

    writeJSON('pricing.json', pricing);
    return res.redirect('/admin/pricing');
  }

  if (action === 'delete') {
    const id = Number(req.body.id);
    pricing = pricing.filter((p) => p.id !== id);
    writeJSON('pricing.json', pricing);
    return res.redirect('/admin/pricing');
  }

  res.redirect('/admin/pricing');
});

/* ---------------------- GET ORDER CREATE (NEW) ---------------------- */
app.get('/order/create', (req, res) => {
  const pricing = readJSON('pricing.json') || [];
  res.render('order-create', { pricing });
});

/* ---------------------- ORDER CREATE POST ---------------------- */
const upload = multer({
  dest: path.join(__dirname, 'public', 'uploads'),
});

app.post('/create-order', upload.single('attachment'), (req, res) => {
  const orders = readJSON('orders.json') || [];
  const pricing = readJSON('pricing.json') || [];

  const selected = pricing.find((p) => String(p.id) === req.body.pricing_id);

  const total =
    selected && req.body.weight
      ? Number(selected.price) * Number(req.body.weight)
      : 0;

  const newOrder = {
    id: Date.now(),
    name: req.body.name,
    phone: req.body.phone,
    address: req.body.address,
    weight: req.body.weight,
    pricing_id: req.body.pricing_id,
    service_name: selected ? selected.name : '',
    total_price: total,
    status: 'pending',
    attachment: req.file
      ? path.join('uploads', path.basename(req.file.path))
      : null,
    created_at: new Date().toISOString(),
  };

  orders.push(newOrder);
  writeJSON('orders.json', orders);

  req.session.notification = 'Your order has been submitted successfully!';
  req.session.notificationType = 'success';

  res.redirect('/order-success');
});

/* ---------------------- ADMIN ORDERS ---------------------- */
app.get('/admin/orders', requireAdmin, (req, res) => {
  const orders = readJSON('orders.json') || [];
  res.render('admin/orders', { orders });
});

app.post('/admin/order/:id/status', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const orders = readJSON('orders.json') || [];

  const o = orders.find((x) => x.id === id);
  if (o) {
    o.status = req.body.status;
    o.updated_at = new Date().toISOString();
    writeJSON('orders.json', orders);
  }

  res.redirect('/admin/orders');
});

/* ---------------------- ORDER SUCCESS ---------------------- */
app.get('/order-success', (req, res) => {
  res.render('order-success');
});

/* ---------------------- CATCH ALL FORMS ---------------------- */
app.post('*', (req, res) => {
  const forms = readJSON('forms.json') || [];
  forms.push({
    path: req.path,
    body: req.body,
    created_at: new Date().toISOString(),
  });
  writeJSON('forms.json', forms);

  return res.redirect(req.headers.referer || '/');
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log('Server listening on', PORT));
}

module.exports = app;
