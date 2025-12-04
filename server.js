// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const bodyParser = require("body-parser");
const multer = require("multer");

const app = express();

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SERVICES_FILE = path.join(DATA_DIR, "services.json");
const PRICING_FILE = path.join(DATA_DIR, "pricing.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const NOTIFICATIONS_FILE = path.join(DATA_DIR, "notifications.json");
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(SERVICES_FILE)) fs.writeFileSync(SERVICES_FILE, "[]");
if (!fs.existsSync(PRICING_FILE)) fs.writeFileSync(PRICING_FILE, "[]");
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");
if (!fs.existsSync(NOTIFICATIONS_FILE)) fs.writeFileSync(NOTIFICATIONS_FILE, "[]");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readJSON(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("readJSON error", file, e);
    return [];
  }
}
function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("writeJSON error", file, e);
  }
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  })
);

const upload = multer({ dest: UPLOAD_DIR });

function userAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}
function adminAuth(req, res, next) {
  if (req.session.admin) return next();
  res.redirect("/admin/login");
}

// home
app.get("/", (req, res) => {
  const services = readJSON(SERVICES_FILE);
  const pricing = readJSON(PRICING_FILE);
  const testimonials = [
    { name: "Rahul Sharma", location: "Pokhara", image: "https://i.pravatar.cc/150?img=11", message: "Super fast pickup and very clean clothes!" },
    { name: "Anita KC", location: "Butwal", image: "https://i.pravatar.cc/150?img=32", message: "Affordable prices and reliable service." },
    { name: "Sujan Lama", location: "Kathmandu", image: "https://i.pravatar.cc/150?img=45", message: "Pickup and delivery on time every time!" }
  ];
  res.render("index", { services, pricing, testimonials, user: req.session.user });
});

// user auth
app.get("/login", (req, res) => res.render("login", { error: null }));
app.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.render("login", { error: "Enter credentials" });

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);
    if (!user) return res.render("login", { error: "Invalid email or password" });

    if (!bcrypt.compareSync(password, user.password_hash || "")) return res.render("login", { error: "Invalid email or password" });

    req.session.user = user;
    res.redirect("/user/dashboard");
  } catch (e) {
    console.error("POST /login error", e);
    res.status(500).render("login", { error: "Internal server error" });
  }
});

app.get("/register", (req, res) => res.render("register", { error: null }));
app.post("/register", (req, res) => {
  try {
    const { first_name, last_name, email, phone, password, confirm_password } = req.body;
    if (!password || password !== confirm_password) return res.render("register", { error: "Passwords do not match" });

    const users = readJSON(USERS_FILE);
    if (users.find(u => u.email === email)) return res.render("register", { error: "Email already registered" });

    const newUser = { id: Date.now(), first_name, last_name, email, phone, password_hash: bcrypt.hashSync(password, 10), created_at: new Date().toISOString() };
    users.push(newUser);
    writeJSON(USERS_FILE, users);

    req.session.user = newUser;
    res.redirect("/user/dashboard");
  } catch (e) {
    console.error("POST /register error", e);
    res.status(500).render("register", { error: "Internal server error" });
  }
});

// user pages
app.get("/user/dashboard", userAuth, (req, res) => {
  const orders = readJSON(ORDERS_FILE).filter(o => o.user_id === req.session.user.id);
  res.render("user/dashboard", { user: req.session.user, orders });
});

app.get("/user/requests", userAuth, (req, res) => {
  const orders = readJSON(ORDERS_FILE).filter(o => o.user_id === req.session.user.id);
  res.render("user/requests", { user: req.session.user, orders });
});

app.get("/user/request-details", userAuth, (req, res) => {
  const id = Number(req.query.id);
  const order = readJSON(ORDERS_FILE).find(o => Number(o.id) === id);
  if (!order) return res.status(404).send("Order not found");
  res.render("user/request-details", { user: req.session.user, order });
});

app.get("/user/new-request", userAuth, (req, res) => {
  const services = readJSON(SERVICES_FILE);
  const pricing = readJSON(PRICING_FILE);
  res.render("user/new-request", { user: req.session.user, services, pricing });
});

function createOrderHandler(req, res) {
  try {
    const { name, phone, address, items, service_id } = req.body;
    const orders = readJSON(ORDERS_FILE);
    const file = req.file ? "uploads/" + req.file.filename : null;
    const newOrder = {
      id: Date.now(),
      user_id: req.session.user ? req.session.user.id : null,
      name,
      phone,
      address,
      items,
      service_id,
      attachment: file,
      status: "pending",
      created_at: new Date().toISOString()
    };
    orders.push(newOrder);
    writeJSON(ORDERS_FILE, orders);
    // add admin notification
    const notifs = readJSON(NOTIFICATIONS_FILE);
    notifs.push({ id: Date.now(), recipient_type: "admin", title: "New Order", message: `Order #${newOrder.id}`, order_id: newOrder.id, read: false, created_at: new Date().toISOString() });
    writeJSON(NOTIFICATIONS_FILE, notifs);
    res.redirect("/user/dashboard");
  } catch (e) {
    console.error("createOrderHandler error", e);
    res.status(500).send("Server error creating order");
  }
}

app.post("/create-order", upload.single("attachment"), userAuth, createOrderHandler);
app.post("/user/create-order", upload.single("attachment"), userAuth, createOrderHandler);

// logout
app.get("/logout", (req, res) => { req.session.destroy(() => res.redirect("/")); });

// admin auth & login
app.get("/admin/login", (req, res) => res.render("admin/login", { error: null }));
app.post("/admin/login", (req, res) => {
  try {
    const { username, password } = req.body;
    if (username === "admin" && password === "admin") {
      req.session.admin = true;
      return res.redirect("/admin/dashboard");
    }
    return res.render("admin/login", { error: "Invalid admin credentials" });
  } catch (e) {
    console.error("POST /admin/login error", e);
    res.status(500).render("admin/login", { error: "Internal server error" });
  }
});

// admin logout
app.post("/admin/logout", (req, res) => { req.session.destroy(() => res.redirect("/admin/login")); });
app.get("/admin/logout", (req, res) => { req.session.destroy(() => res.redirect("/admin/login")); });

// admin dashboard and pages
app.get("/admin/dashboard", adminAuth, (req, res) => {
  const services = readJSON(SERVICES_FILE);
  const pricing = readJSON(PRICING_FILE);
  const orders = readJSON(ORDERS_FILE);
  const users = readJSON(USERS_FILE);
  res.render("admin/dashboard", { services, pricing, orders, users });
});

// pricing pages
app.get("/admin/pricing", adminAuth, (req, res) => {
  const pricing = readJSON(PRICING_FILE);
  res.render("admin/pricing", { pricing });
});

app.post("/admin/pricing", adminAuth, (req, res) => {
  const action = req.body.action || "update_pricing";
  let pricing = readJSON(PRICING_FILE) || [];

  if (action === "update_pricing") {
    const id = req.body.pricing_id ? Number(req.body.pricing_id) : null;
    const name = (req.body.name || "").trim();
    const priceRaw = req.body.price || req.body.price_raw || "0";
    const price = Number(priceRaw) || 0;
    const unit = req.body.unit || "per kg";
    const description = req.body.description || "";
    const status = req.body.status || "active";

    if (!name || price <= 0) {
      return res.redirect("/admin/pricing");
    }

    if (id) {
      const idx = pricing.findIndex(p => Number(p.id) === Number(id));
      if (idx !== -1) {
        pricing[idx].name = name;
        pricing[idx].price = price;
        pricing[idx].unit = unit;
        pricing[idx].description = description;
        pricing[idx].status = status;
        pricing[idx].updated_at = new Date().toISOString();
        writeJSON(PRICING_FILE, pricing);
        return res.redirect("/admin/pricing");
      }
    }

    const newItem = { id: Date.now(), name, price, unit, description, status, created_at: new Date().toISOString() };
    pricing.push(newItem);
    writeJSON(PRICING_FILE, pricing);
    return res.redirect("/admin/pricing");
  }

  if (action === "delete_pricing") {
    const id = Number(req.body.pricing_id || req.body.id || 0);
    if (!id) return res.redirect("/admin/pricing");
    pricing = pricing.filter(p => Number(p.id) !== id);
    writeJSON(PRICING_FILE, pricing);
    return res.redirect("/admin/pricing");
  }

  res.redirect("/admin/pricing");
});

app.post("/admin/pricing/:id/delete", adminAuth, (req, res) => {
  const id = Number(req.params.id);
  let pricing = readJSON(PRICING_FILE) || [];
  pricing = pricing.filter(p => Number(p.id) !== id);
  writeJSON(PRICING_FILE, pricing);
  res.redirect("/admin/pricing");
});

// services
app.get("/admin/services", adminAuth, (req, res) => {
  const services = readJSON(SERVICES_FILE);
  res.render("admin/services", { services });
});

app.post("/admin/services/add", adminAuth, (req, res) => {
  const { name, description, price } = req.body;
  const services = readJSON(SERVICES_FILE);
  services.push({ id: Date.now(), name, description, price, status: "active" });
  writeJSON(SERVICES_FILE, services);
  res.redirect("/admin/services");
});

// admin orders
app.get("/admin/orders", adminAuth, (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  res.render("admin/orders", { orders });
});

app.get("/admin/request-details", adminAuth, (req, res) => {
  const id = Number(req.query.id);
  const order = readJSON(ORDERS_FILE).find(o => Number(o.id) === id);
  if (!order) return res.status(404).send("Order not found");
  res.render("admin/request-details", { order });
});

app.post("/admin/order/:id/status", adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const orders = readJSON(ORDERS_FILE);
  const order = orders.find(o => Number(o.id) === id);
  if (order) {
    order.status = req.body.status || order.status;
    order.updated_at = new Date().toISOString();
    writeJSON(ORDERS_FILE, orders);
  }
  res.redirect("/admin/orders");
});

// admin users + details
app.get("/admin/users", adminAuth, (req, res) => {
  const users = readJSON(USERS_FILE);
  res.render("admin/users", { users });
});

app.get("/admin/user-details", adminAuth, (req, res) => {
  const id = Number(req.query.id);
  const users = readJSON(USERS_FILE);
  const orders = readJSON(ORDERS_FILE);
  const user = users.find(u => Number(u.id) === id);
  if (!user) return res.status(404).send("User not found");
  res.render("admin/user-details", { user, orders });
});

// notifications API (simple)
app.get("/api/notifications", (req, res) => {
  const notifications = readJSON(NOTIFICATIONS_FILE);
  res.json({ notifications });
});

app.post("/api/notifications/:id/read", (req, res) => {
  const id = Number(req.params.id);
  const notifs = readJSON(NOTIFICATIONS_FILE);
  const n = notifs.find(x => Number(x.id) === id);
  if (n) {
    n.read = true;
    n.read_at = new Date().toISOString();
    writeJSON(NOTIFICATIONS_FILE, notifs);
    return res.json({ success: true });
  }
  res.status(404).json({ success: false });
});

// fallback 404
app.use((req, res) => {
  res.status(404).send("Not found: " + req.path);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port " + port));
