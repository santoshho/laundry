const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const bodyParser = require("body-parser");

const app = express();

// ===============================
// FILE PATHS
// ===============================
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SERVICES_FILE = path.join(DATA_DIR, "services.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

// Create data folder if missing
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Create JSON files if missing
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(SERVICES_FILE)) fs.writeFileSync(SERVICES_FILE, "[]");
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");

// ===============================
// HELPERS
// ===============================
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ===============================
// EXPRESS CONFIG
// ===============================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: "secret_key",
    resave: false,
    saveUninitialized: true
  })
);

// ===============================
// HOME PAGE
// ===============================
app.get("/", (req, res) => {
  const services = readJSON(SERVICES_FILE);
  res.render("index", { services, user: req.session.user });
});

// ===============================
// LOGIN (ADMIN + USER)
// ===============================
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  // ADMIN LOGIN
  if (email === "admin" && password === "admin") {
    req.session.admin = true;
    return res.redirect("/admin/dashboard");
  }

  // USER LOGIN
  const users = readJSON(USERS_FILE);
  const user = users.find((u) => u.email === email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.render("login", { error: "Invalid email or password" });
  }

  req.session.user = user;
  res.redirect("/user/dashboard");
});

// ===============================
// USER REGISTER
// ===============================
app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", (req, res) => {
  const { first_name, last_name, email, phone, password } = req.body;

  const users = readJSON(USERS_FILE);

  if (users.find((u) => u.email === email)) {
    return res.render("register", { error: "Email already exists" });
  }

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

// ===============================
// USER AUTH
// ===============================
function userAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// ===============================
// USER DASHBOARD
// ===============================
app.get("/user/dashboard", userAuth, (req, res) => {
  const orders = readJSON(ORDERS_FILE).filter(
    (order) => order.user_id === req.session.user.id
  );
  res.render("user/dashboard", { user: req.session.user, orders });
});

// ===============================
// USER REQUEST DETAILS
// ===============================
app.get("/user/request-details/:id", userAuth, (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  const order = orders.find((o) => o.id == req.params.id);

  if (!order) return res.send("Order not found");

  const service = readJSON(SERVICES_FILE).find((s) => s.id == order.service_id);

  res.render("user/request-details", {
    user: req.session.user,
    order,
    service
  });
});

// ===============================
// USER NEW ORDER
// ===============================
app.get("/user/new-request", userAuth, (req, res) => {
  const services = readJSON(SERVICES_FILE);
  res.render("user/new-request", { user: req.session.user, services });
});

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

// ===============================
// LOGOUT
// ===============================
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ===============================
// ADMIN AUTH
// ===============================
function adminAuth(req, res, next) {
  if (!req.session.admin) return res.redirect("/admin/login");
  next();
}

// ===============================
// ADMIN LOGIN PAGE
// ===============================
app.get("/admin/login", (req, res) => {
  res.render("admin/login", { error: null });
});

// ===============================
// ADMIN DASHBOARD
// ===============================
app.get("/admin/dashboard", adminAuth, (req, res) => {
  const services = readJSON(SERVICES_FILE);
  const orders = readJSON(ORDERS_FILE);
  res.render("admin/dashboard", { services, orders });
});

// ===============================
// ADMIN SERVICES
// ===============================
app.get("/admin/services", adminAuth, (req, res) => {
  const services = readJSON(SERVICES_FILE);
  res.render("admin/services", { services });
});

app.post("/admin/services/add", adminAuth, (req, res) => {
  const { name, description, price } = req.body;

  const services = readJSON(SERVICES_FILE);
  services.push({
    id: Date.now(),
    name,
    description,
    price,
    status: "active"
  });

  writeJSON(SERVICES_FILE, services);
  res.redirect("/admin/services");
});

// ===============================
// ADMIN LOGOUT
// ===============================
app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

// ===============================
// START SERVER
// ===============================
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port " + port));
