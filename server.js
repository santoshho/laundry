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
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");

// ensure directories + files
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(SERVICES_FILE)) fs.writeFileSync(SERVICES_FILE, "[]");
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readJSON(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("readJSON error", file, err);
    return [];
  }
}
function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("writeJSON error", file, err);
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

// --- Home
app.get("/", (req, res) => {
  try {
    const services = readJSON(SERVICES_FILE);
    res.render("index", { user: req.session.user, services });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// --- User login
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find((u) => u.email === email);
    if (!user || !bcrypt.compareSync(password, user.password_hash || "")) {
      return res.render("login", { error: "Invalid email or password" });
    }
    req.session.user = user;
    res.redirect("/user/dashboard");
  } catch (err) {
    console.error("POST /login error", err);
    res.status(500).render("login", { error: "Internal server error" });
  }
});

// --- Admin login (simple demo admin/admin)
app.get("/admin/login", (req, res) => {
  res.render("admin/login", { error: null });
});

app.post("/admin/login", (req, res) => {
  try {
    const { username, password } = req.body;
    if (username === "admin" && password === "admin") {
      req.session.admin = true;
      return res.redirect("/admin/dashboard");
    }
    return res.render("admin/login", { error: "Invalid admin credentials" });
  } catch (err) {
    console.error("POST /admin/login error", err);
    res.status(500).render("admin/login", { error: "Internal server error" });
  }
});

// allow POST logout for admin (templates used a form POST)
app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

// GET logout for convenience
app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

// --- Register
app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", (req, res) => {
  try {
    const { first_name, last_name, email, phone, password, confirm_password } = req.body;
    if (!password || password !== confirm_password) return res.render("register", { error: "Passwords do not match" });

    const users = readJSON(USERS_FILE);
    if (users.find((u) => u.email === email)) return res.render("register", { error: "Email already registered" });

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

    req.session.user = newUser;
    res.redirect("/user/dashboard");
  } catch (err) {
    console.error("POST /register error", err);
    res.status(500).render("register", { error: "Internal server error" });
  }
});

// --- User pages
app.get("/user/dashboard", userAuth, (req, res) => {
  try {
    const orders = readJSON(ORDERS_FILE).filter((o) => o.user_id === req.session.user.id);
    res.render("user/dashboard", { user: req.session.user, orders });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.get("/user/requests", userAuth, (req, res) => {
  try {
    const orders = readJSON(ORDERS_FILE).filter((o) => o.user_id === req.session.user.id);
    res.render("user/requests", { user: req.session.user, orders });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.get("/user/request-details", userAuth, (req, res) => {
  try {
    const id = Number(req.query.id);
    const order = readJSON(ORDERS_FILE).find((o) => Number(o.id) === id);
    if (!order) return res.status(404).send("Order not found");
    res.render("user/request-details", { user: req.session.user, order });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.get("/user/new-request", userAuth, (req, res) => {
  try {
    const services = readJSON(SERVICES_FILE);
    res.render("user/new-request", { user: req.session.user, services });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// create order function used by two routes (templates used different actions)
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
    res.redirect("/user/dashboard");
  } catch (err) {
    console.error("createOrder error", err);
    res.status(500).send("Server error creating order");
  }
}

app.post("/create-order", upload.single("attachment"), userAuth, createOrderHandler);
app.post("/user/create-order", upload.single("attachment"), userAuth, createOrderHandler);

// logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// --- Admin area
app.get("/admin/dashboard", adminAuth, (req, res) => {
  try {
    const services = readJSON(SERVICES_FILE);
    const orders = readJSON(ORDERS_FILE);
    const users = readJSON(USERS_FILE);
    res.render("admin/dashboard", { services, orders, users });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.get("/admin/services", adminAuth, (req, res) => {
  try {
    const services = readJSON(SERVICES_FILE);
    res.render("admin/services", { services });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.post("/admin/services/add", adminAuth, (req, res) => {
  try {
    const { name, description, price } = req.body;
    const services = readJSON(SERVICES_FILE);
    services.push({ id: Date.now(), name, description, price, status: "active" });
    writeJSON(SERVICES_FILE, services);
    res.redirect("/admin/services");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.get("/admin/orders", adminAuth, (req, res) => {
  try {
    const orders = readJSON(ORDERS_FILE);
    res.render("admin/orders", { orders });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Admin view of a specific order (templates link to /admin/request-details?id=...)
app.get("/admin/request-details", adminAuth, (req, res) => {
  try {
    const id = Number(req.query.id);
    const order = readJSON(ORDERS_FILE).find((o) => Number(o.id) === id);
    if (!order) return res.status(404).send("Order not found");
    res.render("admin/request-details", { order });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// update order status
app.post("/admin/order/:id/status", adminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const orders = readJSON(ORDERS_FILE);
    const order = orders.find((o) => Number(o.id) === id);
    if (order) {
      order.status = req.body.status || order.status;
      order.updated_at = new Date().toISOString();
      writeJSON(ORDERS_FILE, orders);
    }
    res.redirect("/admin/orders");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Admin users list
app.get("/admin/users", adminAuth, (req, res) => {
  try {
    const users = readJSON(USERS_FILE);
    res.render("admin/users", { users });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Admin user details (templates expect /admin/user-details?id=...)
app.get("/admin/user-details", adminAuth, (req, res) => {
  try {
    const id = Number(req.query.id);
    const users = readJSON(USERS_FILE);
    const orders = readJSON(ORDERS_FILE);
    const user = users.find((u) => Number(u.id) === id);
    if (!user) return res.status(404).send("User not found");
    res.render("admin/user-details", { user, orders });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// fallback: if route is not found, return 404 (helps with debugging missing views)
app.use((req, res) => {
  res.status(404).send("Not found: " + req.path);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Running on port " + port));
