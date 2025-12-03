const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const app = express();

// ------------------ CONFIG ------------------
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PRICING_FILE = path.join(DATA_DIR, "pricing.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(PRICING_FILE)) fs.writeFileSync(PRICING_FILE, "[]");
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "supersecret123",
    resave: false,
    saveUninitialized: false,
  })
);

// ------------------ HELPERS ------------------
function loadJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin)
    return res.redirect("/login");
  next();
}

// ------------------ ROUTES ------------------

// HOME
app.get("/", (req, res) => {
  const pricing = loadJSON(PRICING_FILE);
  res.render("index", { user: req.session.user, pricing });
});

// ----------- AUTH PAGES --------------
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  let users = loadJSON(USERS_FILE);

  const user = users.find((u) => u.email === email);
  if (!user) return res.render("login", { error: "User not found!" });

  if (!bcrypt.compareSync(password, user.password)) {
    return res.render("login", { error: "Incorrect password!" });
  }

  req.session.user = user;
  res.redirect("/dashboard");
});

// REGISTER PAGE
app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", (req, res) => {
  const { email, password } = req.body;

  let users = loadJSON(USERS_FILE);
  if (users.some((u) => u.email === email))
    return res.render("register", { error: "Email already exists!" });

  const newUser = {
    id: Date.now(),
    email,
    password: bcrypt.hashSync(password, 10),
    isAdmin: false,
  };

  users.push(newUser);
  saveJSON(USERS_FILE, users);

  res.redirect("/login");
});

// ----------- DASHBOARD --------------
app.get("/dashboard", requireLogin, (req, res) => {
  const pricing = loadJSON(PRICING_FILE);
  res.render("dashboard", {
    user: req.session.user,
    pricing,
  });
});

// LOGOUT
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// ----------------------------------------------
//                PRICING ROUTES
// ----------------------------------------------

// Admin Pricing Manager Page
app.get("/admin/pricing", requireAdmin, (req, res) => {
  const pricing = loadJSON(PRICING_FILE);
  res.render("pricing", { pricing });
});

// Add / Edit Pricing
app.post("/admin/pricing/save", requireAdmin, (req, res) => {
  const { id, name, pricePerKg } = req.body;
  let pricing = loadJSON(PRICING_FILE);

  if (id) {
    // Update existing
    const item = pricing.find((p) => p.id == id);
    if (item) {
      item.name = name;
      item.pricePerKg = parseFloat(pricePerKg);
    }
  } else {
    // Add new
    pricing.push({
      id: Date.now(),
      name,
      pricePerKg: parseFloat(pricePerKg),
    });
  }

  saveJSON(PRICING_FILE, pricing);
  res.redirect("/admin/pricing");
});

// Delete pricing
app.get("/admin/pricing/delete/:id", requireAdmin, (req, res) => {
  let pricing = loadJSON(PRICING_FILE);
  pricing = pricing.filter((p) => p.id != req.params.id);
  saveJSON(PRICING_FILE, pricing);
  res.redirect("/admin/pricing");
});

// ----------------------------------------------
//                ORDER ROUTES
// ----------------------------------------------

// Show Create Order Page
app.get("/order/create", requireLogin, (req, res) => {
  const pricing = loadJSON(PRICING_FILE);
  res.render("create-order", { pricing });
});

// Save Order
app.post("/order/create", requireLogin, (req, res) => {
  const { serviceId, weight } = req.body;

  let pricing = loadJSON(PRICING_FILE);
  const service = pricing.find((p) => p.id == serviceId);

  if (!service)
    return res.send("Invalid service!");

  const amount = service.pricePerKg * parseFloat(weight);

  let orders = loadJSON(ORDERS_FILE);
  orders.push({
    id: Date.now(),
    userId: req.session.user.id,
    serviceId,
    serviceName: service.name,
    weight,
    amount,
    createdAt: new Date(),
  });

  saveJSON(ORDERS_FILE, orders);

  res.redirect("/dashboard");
});

// ------------------ START SERVER ------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
