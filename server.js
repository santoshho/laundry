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
    secret: process.env.SESSION_SECRET || "change_this_secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  })
);

/* ---------------------- READ / WRITE JSON ---------------------- */
function readJSON(filename) {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) return null;

  try {
    const text = fs.readFileSync(p, "utf8") || "null";
    return JSON.parse(text);
  } catch (err) {
    console.error("JSON read error:", filename, err);
    return null;
  }
}

function writeJSON(filename, data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("JSON write error:", filename, err);
  }
}

/* ---------------------- CREATE DEFAULT ADMIN ---------------------- */
(function ensureAdmin() {
  const admPath = path.join(DATA_DIR, "admin.json");

  if (!fs.existsSync(admPath)) {
    const pwd = process.env.ADMIN_PWD || "admin";
    const hash = bcrypt.hashSync(pwd, 8);

    const admin = { username: "admin", password_hash: hash };

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

    fs.writeFileSync(admPath, JSON.stringify(admin, null, 2), "utf8");

    console.log("Default admin created (username: admin)");
  }
})();

function isAdmin(req) {
  if (!req.session || !req.session.user) return false;
  const admin = readJSON("admin.json");

  return req.session.user.username === admin.username;
}

/* ---------------------- GLOBAL LOCALS ---------------------- */
app.use((req, res, next) => {
  res.locals.adminLinks = [
    { href: "/admin/dashboard", label: "Dashboard" },
    { href: "/admin/services", label: "Services" },
    { href: "/admin/pricing", label: "Pricing" },
    { href: "/admin/orders", label: "Orders" }
  ];
  res.locals.user = req.session.user || null;
  next();
});

/* ---------------------- PAGES PRELOAD DATA ---------------------- */
app.use((req, res, next) => {
  res.locals.services = readJSON("services.json") || [];
  res.locals.pricing = readJSON("pricing.json") || [];
  res.locals.orders = readJSON("orders.json") || [];
  next();
});

/* ---------------------- HOME PAGE ---------------------- */
app.get("/", (req, res) => {
  const all = readJSON("services.json") || [];

  const services = all.filter(s => s.available !== false);

  res.render("index", { services });
});

/* ---------------------- ADMIN LOGIN ---------------------- */
app.get("/admin/login", (req, res) => res.render("admin/login"));

app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  const admin = readJSON("admin.json");

  if (username === admin.username && bcrypt.compareSync(password, admin.password_hash)) {
    req.session.user = { username: admin.username, isAdmin: true, id: "admin" };
    return res.redirect("/admin/dashboard");
  }

  res.render("admin/login", { error: "Invalid credentials" });
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* ---------------------- REQUIRE ADMIN ---------------------- */
function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  return res.redirect("/admin/login");
}

/* ---------------------- ADMIN DASHBOARD ---------------------- */
app.get("/admin/dashboard", requireAdmin, (req, res) => {
  res.render("admin/dashboard");
});

/* ---------------------- ADMIN SERVICES ---------------------- */
app.get("/admin/services", requireAdmin, (req, res) => {
  const services = readJSON("services.json") || [];
  res.render("admin/services", { services });
});

app.post("/admin/service/add", requireAdmin, (req, res) => {
  let services = readJSON("services.json") || [];

  services.push({
    id: Date.now(),
    name: req.body.name,
    available: true
  });

  writeJSON("services.json", services);
  res.redirect("/admin/services");
});

app.post("/admin/service/:id/toggle", requireAdmin, (req, res) => {
  let services = readJSON("services.json") || [];
  const sid = req.params.id;

  const s = services.find(a => String(a.id) === sid);

  if (s) s.available = !s.available;

  writeJSON("services.json", services);
  res.redirect("/admin/services");
});

/* ---------------------- PRICING ---------------------- */
app.get("/admin/pricing", requireAdmin, (req, res) => {
  const pricing = readJSON("pricing.json") || [];
  res.render("admin/pricing", { pricing });
});

app.post("/admin/pricing", requireAdmin, (req, res) => {
  const { action } = req.body;
  let pricing = readJSON("pricing.json") || [];

  if (action === "add") {
    pricing.push({
      id: Date.now(),
      name: req.body.name,
      price: Number(req.body.price),
      unit: "per kg"
    });
  }

  if (action === "delete") {
    pricing = pricing.filter(p => p.id !== Number(req.body.id));
  }

  writeJSON("pricing.json", pricing);
  res.redirect("/admin/pricing");
});

/* ---------------------- USER ORDER CREATE PAGE ---------------------- */
app.get("/order/create", (req, res) => {
  const pricing = readJSON("pricing.json") || [];
  const services = readJSON("services.json") || [];

  res.render("order-create", {
    pricing,
    services
  });
});

/* ---------------------- USER ORDER SUBMIT ---------------------- */
const upload = multer({ dest: path.join(__dirname, "public/uploads") });

app.post("/create-order", upload.single("attachment"), (req, res) => {
  const orders = readJSON("orders.json") || [];
  const pricing = readJSON("pricing.json") || [];

  const priceItem = pricing.find(p => String(p.id) === req.body.pricing_id);

  const total = priceItem ? Number(priceItem.price) * Number(req.body.weight || 0) : 0;

  const order = {
    id: Date.now(),
    name: req.body.name,
    phone: req.body.phone,
    address: req.body.address,
    service_id: req.body.service_id,
    pricing_id: req.body.pricing_id,
    weight: req.body.weight,
    total_price: total,
    status: "pending",
    attachment: req.file ? "uploads/" + req.file.filename : null,
    created_at: new Date().toISOString()
  };

  orders.push(order);
  writeJSON("orders.json", orders);

  res.redirect("/order-success");
});

/* ---------------------- ORDER SUCCESS PAGE ---------------------- */
app.get("/order-success", (req, res) => res.render("order-success"));

/* ---------------------- ADMIN ORDERS ---------------------- */
app.get("/admin/orders", requireAdmin, (req, res) => {
  const orders = readJSON("orders.json") || [];
  res.render("admin/orders", { orders });
});

app.post("/admin/order/:id/status", requireAdmin, (req, res) => {
  let orders = readJSON("orders.json") || [];

  const o = orders.find(x => x.id === Number(req.params.id));
  if (o) {
    o.status = req.body.status;
    o.updated_at = new Date().toISOString();
  }

  writeJSON("orders.json", orders);
  res.redirect("/admin/orders");
});

/* ---------------------- SERVER START ---------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
