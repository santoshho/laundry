const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");

const app = express();

// ------------------------------
// BASIC CONFIG
// ------------------------------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(
  session({
    secret: "laundry_secret_123",
    resave: false,
    saveUninitialized: true,
  })
);

// ------------------------------
// JSON FILE PATHS
// ------------------------------
const usersFile = path.join(__dirname, "data/users.json");
const adminFile = path.join(__dirname, "data/admin.json");
const ordersFile = path.join(__dirname, "data/orders.json");
const servicesFile = path.join(__dirname, "data/services.json");

// Read JSON
function readJSON(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Write JSON
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ------------------------------
// AUTH MIDDLEWARE
// ------------------------------
function userAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

function adminAuth(req, res, next) {
  if (!req.session.admin) return res.redirect("/admin/login");
  next();
}

// ------------------------------
// HOME PAGE (important fix!!!)
// ------------------------------
app.get("/", (req, res) => {
  const services = readJSON(servicesFile); // FIXED
  res.render("index", { services });
});

// ------------------------------
// USER AUTH
// ------------------------------
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

// REGISTER
app.post("/register", async (req, res) => {
  const users = readJSON(usersFile);

  const exists = users.find(u => u.email === req.body.email);
  if (exists) {
    return res.render("register", { error: "Email already exists!" });
  }

  const hashed = await bcrypt.hash(req.body.password, 10);

  const newUser = {
    id: Date.now(),
    name: req.body.name,
    email: req.body.email,
    password: hashed,
  };

  users.push(newUser);
  writeJSON(usersFile, users);

  res.redirect("/login");
});

// LOGIN
app.post("/login", async (req, res) => {
  const users = readJSON(usersFile);

  const user = users.find(u => u.email === req.body.email);
  if (!user) {
    return res.render("login", { error: "Invalid login details" });
  }

  const ok = await bcrypt.compare(req.body.password, user.password);
  if (!ok) {
    return res.render("login", { error: "Invalid login details" });
  }

  req.session.user = user;
  res.redirect("/user/dashboard");
});

// ------------------------------
// USER DASHBOARD
// ------------------------------
app.get("/user/dashboard", userAuth, (req, res) => {
  const orders = readJSON(ordersFile).filter(o => o.userId === req.session.user.id);

  res.render("user/dashboard", {
    user: req.session.user,
    orders
  });
});

// ------------------------------
// NEW ORDER
// ------------------------------
app.get("/user/new-request", userAuth, (req, res) => {
  const services = readJSON(servicesFile);

  res.render("user/new-request", {
    user: req.session.user,
    services
  });
});

app.post("/user/new-request", userAuth, (req, res) => {
  const orders = readJSON(ordersFile);

  const newOrder = {
    id: Date.now(),
    userId: req.session.user.id,
    service: req.body.service,
    quantity: req.body.quantity,
    address: req.body.address,
    status: "Pending",
    date: new Date().toISOString()
  };

  orders.push(newOrder);
  writeJSON(ordersFile, orders);

  res.redirect("/user/requests");
});

// ------------------------------
// USER – ALL REQUESTS
// ------------------------------
app.get("/user/requests", userAuth, (req, res) => {
  const orders = readJSON(ordersFile).filter(o => o.userId === req.session.user.id);

  res.render("user/requests", {
    user: req.session.user,
    orders
  });
});

// ------------------------------
// ADMIN AUTH (FIXED FOR BCRYPT)
// ------------------------------
app.get("/admin/login", (req, res) => {
  res.render("admin/login", { error: null });
});

app.post("/admin/login", async (req, res) => {
  const admin = readJSON(adminFile);

  if (req.body.username !== admin.username) {
    return res.render("admin/login", { error: "Invalid admin credentials" });
  }

  const ok = await bcrypt.compare(req.body.password, admin.password_hash);
  if (!ok) {
    return res.render("admin/login", { error: "Invalid admin credentials" });
  }

  req.session.admin = true;
  res.redirect("/admin/dashboard");
});

// ------------------------------
// ADMIN DASHBOARD
// ------------------------------
app.get("/admin/dashboard", adminAuth, (req, res) => {
  const orders = readJSON(ordersFile);
  res.render("admin/dashboard", { orders });
});

app.get("/admin/orders/:id", adminAuth, (req, res) => {
  const orders = readJSON(ordersFile);
  const order = orders.find(o => o.id == req.params.id);

  res.render("admin/order-details", { order });
});

// ------------------------------
// LOGOUT
// ------------------------------
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// ------------------------------
// START SERVER
// ------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
