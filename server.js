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

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(SERVICES_FILE)) fs.writeFileSync(SERVICES_FILE, "[]");
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || "[]");
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(
  session({
    secret: "secret-key",
    resave: false,
    saveUninitialized: true
  })
);

const upload = multer({ dest: UPLOAD_DIR });

/* ----------- AUTH MIDDLEWARE ----------- */
function userAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

function adminAuth(req, res, next) {
  if (req.session.admin) return next();
  res.redirect("/admin/login");
}

/* ----------- HOME PAGE ----------- */
app.get("/", (req, res) => {
  const services = readJSON(SERVICES_FILE);
  res.render("index", { user: req.session.user, services });
});

/* ----------- USER LOGIN ----------- */
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.email === email);

  if (!user) return res.render("login", { error: "Invalid login" });
  if (!bcrypt.compareSync(password, user.password_hash))
    return res.render("login", { error: "Invalid login" });

  req.session.user = user;
  res.redirect("/user/dashboard");
});

/* ----------- ADMIN LOGIN ----------- */
app.get("/admin/login", (req, res) => {
  res.render("admin/login", { error: null });
});

app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "admin") {
    req.session.admin = true;
    return res.redirect("/admin/dashboard");
  }

  res.render("admin/login", { error: "Invalid admin credentials" });
});

/* ----------- REGISTER ----------- */
app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", (req, res) => {
  const { first_name, last_name, email, phone, password, confirm_password } =
    req.body;

  const users = readJSON(USERS_FILE);

  if (password !== confirm_password)
    return res.render("register", { error: "Passwords do not match" });

  if (users.find(u => u.email === email))
    return res.render("register", { error: "Email already registered" });

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
});

/* ----------- USER PAGES ----------- */
app.get("/user/dashboard", userAuth, (req, res) => {
  const orders = readJSON(ORDERS_FILE).filter(
    o => o.user_id === req.session.user.id
  );
  res.render("user/dashboard", { user: req.session.user, orders });
});

app.get("/user/requests", userAuth, (req, res) => {
  const orders = readJSON(ORDERS_FILE).filter(
    o => o.user_id === req.session.user.id
  );
  res.render("user/requests", { user: req.session.user, orders });
});

app.get("/user/request-details", userAuth, (req, res) => {
  const id = Number(req.query.id);
  const order = readJSON(ORDERS_FILE).find(o => o.id === id);
  if (!order) return res.send("Order not found");
  res.render("user/request-details", { user: req.session.user, order });
});

app.get("/user/new-request", userAuth, (req, res) => {
  const services = readJSON(SERVICES_FILE);
  res.render("user/new-request", { user: req.session.user, services });
});

/* ----------- CREATE ORDER ----------- */
function createOrder(req, res) {
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
}

app.post("/create-order", upload.single("attachment"), userAuth, createOrder);
app.post("/user/create-order", upload.single("attachment"), userAuth, createOrder);

/* ----------- ADMIN AREA ----------- */
app.get("/admin/dashboard", adminAuth, (req, res) => {
  const services = readJSON(SERVICES_FILE);
  const orders = readJSON(ORDERS_FILE);
  const users = readJSON(USERS_FILE);

  res.render("admin/dashboard", { services, orders, users });
});

/* ADMIN USERS PAGE (NEW) */
app.get("/admin/users", adminAuth, (req, res) => {
  const users = readJSON(USERS_FILE);
  res.render("admin/users", { users });
});

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

app.get("/admin/orders", adminAuth, (req, res) => {
  const orders = readJSON(ORDERS_FILE);
  res.render("admin/orders", { orders });
});

app.get("/admin/request-details", adminAuth, (req, res) => {
  const id = Number(req.query.id);
  const order = readJSON(ORDERS_FILE).find(o => o.id === id);
  if (!order) return res.send("Order not found");
  res.render("admin/request-details", { order });
});

app.post("/admin/order/:id/status", adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const orders = readJSON(ORDERS_FILE);
  const order = orders.find(o => o.id === id);

  if (order) {
    order.status = req.body.status;
    order.updated_at = new Date().toISOString();
    writeJSON(ORDERS_FILE, orders);
  }

  res.redirect("/admin/orders");
});

/* ----------- LOGOUT ----------- */
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

/* ----------- SERVER START ----------- */
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Running on port " + port));
