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
const SERVICES_FILE = path.join(DATA_DIR, "pricing.json");   // services file
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(SERVICES_FILE)) fs.writeFileSync(SERVICES_FILE, "[]");
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

// HOME — sends `services` for index.ejs
app.get("/", (req, res) => {
  const services = loadJSON(SERVICES_FILE);
  res.render("index", { user: req.session.user, services });
});

// ----------- AUTH ROUTES --------------
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  let users = loadJSON(USERS_FILE);

  const user = users.find((u) => u.email === email);
  if (!user) return res.render("login", { error: "User not found!" });

  if (!bcrypt.compareSync(password, user.password))
    return res.render("login", { error: "Incorrect password!" });

  req.session.user = user;
  res.redirect("/dashboard");
});

// REGISTER
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
  const services = loadJSON(SERVICES_FILE);
  res.render("dashboard", {
    user: req.session.user,
    services,
  });
});

// LOGOUT
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// ----------------------------------------------
//                SERVICE / PRICING ROUTES
// ----------------------------------------------

// Admin list
app.get("/admin/pricing", requireAdmin, (req, res) => {
  const services = loadJSON(SERVICES_FILE);
  res.render("pricing", { services });
});

// Add / Edit
app.post("/admin/pricing/save", requireAdmin, (req, res) => {
  const { id, name, price, unit } = req.body;

  let services = loadJSON(SERVICES_FILE);

  if (id) {
    // Update
    const s = services.find((p) => p.id == id);
    if (s) {
      s.name = name;
      s.price = parseFloat(price);
      s.unit = unit || "per kg";
    }
  } else {
    // Add new
    services.push({
      id: Date.now(),
      name,
      price: parseFloat(price),
      unit: unit || "per kg",
    });
  }

  saveJSON(SERVICES_FILE, services);
  res.redirect("/admin/pricing");
});

// Delete
app.post("/admin/pricing/delete/:id", requireAdmin, (req, res) => {
  let services = loadJSON(SERVICES_FILE);
  services = services.filter((p) => p.id != req.params.id);
  saveJSON(SERVICES_FILE, services);

  res.redirect("/admin/pricing");
});

// ----------------------------------------------
//                ORDER ROUTES
// ----------------------------------------------

app.get("/order/create", requireLogin, (req, res) => {
  const services = loadJSON(SERVICES_FILE);
  res.render("create-order", { services });
});

app.post("/order/create", requireLogin, (req, res) => {
  const { serviceId, weight } = req.body;

  let services = loadJSON(SERVICES_FILE);
  const service = services.find((p) => p.id == serviceId);

  if (!service) return res.send("Invalid service!");

  const amount = service.price * parseFloat(weight);

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
