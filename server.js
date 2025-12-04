const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const bodyParser = require("body-parser");

const app = express();

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SERVICES_FILE = path.join(DATA_DIR, "services.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(SERVICES_FILE)) fs.writeFileSync(SERVICES_FILE, "[]");
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");

function readJSON(file) { return JSON.parse(fs.readFileSync(file)); }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: "secret_key",
  resave: false,
  saveUninitialized: true
}));

app.get("/", (req, res) => {
  const services = readJSON(SERVICES_FILE);
  res.render("index", { services, user: req.session.user });
});

app.get("/login", (req, res) => res.render("login", { error: null }));

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password_hash || "")) {
    return res.render("login", { error: "Invalid email or password" });
  }
  req.session.user = user;
  res.redirect("/user/dashboard");
});

app.get("/admin/login", (req, res) => res.render("admin/login", { error: null }));

app.post("/admin/login", (req, res) => {
  const username = req.body.username || req.body.email || req.body.user || "";
  const password = req.body.password || "";
  if ((username === "admin" || username === "admin@laundry.com") && password === "admin") {
    req.session.admin = { username: "admin" };
    return res.redirect("/admin/dashboard");
  }
  return res.render("admin/login", { error: "Admin not found or invalid password" });
});

app.get("/register", (req, res) => res.render("register", { error: null }));

app.post("/register", (req, res) => {
  const { first_name, last_name, email, phone, password } = req.body;
  const users = readJSON(USERS_FILE);
  if (users.find(u => u.email === email)) return res.render("register", { error: "Email already exists" });
  const newUser = {
    id: Date.now(),
    first_name,
    last_name,
    email,
    phone,
    password_hash: bcrypt.hashSync(password, 10),
    created_at: new Date().toISOString()
  };
  users.push(newUser);
  writeJSON(USERS_FILE, users);
  res.redirect("/login");
});

function userAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

app.get("/user/dashboard", userAuth, (req, res) => {
  const orders = readJSON(ORDERS_FILE).filter(o => o.user_id === req.session.user.id);
  res.render("user/dashboard", { user: req.session.user, orders });
});

app.get("/user/new-request", userAuth, (req, res) => {
  const services = readJSON(SERVICES_FILE);
  res.render("user/new-request", { user: req.session.user, services });
});

/* accept /create-order to match form action in your template */
app.post("/create-order", userAuth, (req, res) => {
  const { name, phone, address, items, service_id } = req.body;
  const orders = readJSON(ORDERS_FILE);
  const newOrder = {
    id: Date.now(),
    user_id: req.session.user.id,
    name: name || (req.session.user.first_name + " " + (req.session.user.last_name||"")),
    phone: phone || req.session.user.phone || "",
    address: address || "",
    items: items || "",
    service_id: service_id || null,
    status: "pending",
    created_at: new Date().toISOString()
  };
  orders.push(newOrder);
  writeJSON(ORDERS_FILE, orders);
  res.redirect("/user/dashboard");
});

/* keep /user/create-order as well (if some templates use that) */
app.post("/user/create-order", userAuth, (req, res) => {
  const { items, service_id } = req.body;
  const orders = readJSON(ORDERS_FILE);
  orders.push({
    id: Date.now(),
    user_id: req.session.user.id,
    service_id,
    items,
    status: "pending",
    created_at: new Date().toISOString()
  });
  writeJSON(ORDERS_FILE, orders);
  res.redirect("/user/dashboard");
});

/* view single order details (so links like /user/request-details?id=... work) */
app.get("/user/request-details", userAuth, (req, res) => {
  const id = Number(req.query.id);
  const orders = readJSON(ORDERS_FILE);
  const order = orders.find(o => o.id === id && o.user_id === req.session.user.id);
  if (!order) return res.status(404).send("Order not found");
  res.render("user/request-details", { order, user: req.session.user });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

function adminAuth(req, res, next) {
  if (!req.session.admin) return res.redirect("/admin/login");
  next();
}

app.get("/admin/dashboard", adminAuth, (req, res) => {
  const services = readJSON(SERVICES_FILE);
  const orders = readJSON(ORDERS_FILE);
  res.render("admin/dashboard", { services, orders });
});

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

app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port " + port));
