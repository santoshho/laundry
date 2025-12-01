const express = require("express");
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");
const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Helper functions
const readJSON = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf8"));
const writeJSON = (file, data) => fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2));

/* ============================
   AUTH PAGES
============================ */

// Login Page
app.get("/", (req, res) => {
  res.render("auth/login");
});

// Register Page
app.get("/register", (req, res) => {
  res.render("auth/register");
});

// Handle Registration
app.post("/register", (req, res) => {
  const users = readJSON("users.json");
  const { name, email, password } = req.body;

  if (users.find(u => u.email === email)) {
    return res.send("User already exists!");
  }

  const newUser = {
    id: Date.now(),
    name,
    email,
    password,
    role: "user"
  };

  users.push(newUser);
  writeJSON("users.json", users);

  res.redirect("/");
});

// Handle Login
app.post("/login", (req, res) => {
  const users = readJSON("users.json");
  const { email, password } = req.body;

  const user = users.find(u => u.email === email && u.password === password);

  if (!user) return res.send("Invalid credentials!");

  if (user.role === "admin") {
    return res.redirect(`/admin/dashboard?id=${user.id}`);
  }

  res.redirect(`/user/dashboard?id=${user.id}`);
});

/* ============================
   USER DASHBOARD
============================ */

// User Dashboard
app.get("/user/dashboard", (req, res) => {
  const users = readJSON("users.json");
  const user = users.find(u => u.id == req.query.id);
  res.render("user/dashboard", { user });
});

/* ============================
   REQUEST PAGE (OLD WORKING VERSION)
============================ */

app.get("/user/new-request", (req, res) => {
  const users = readJSON("users.json");
  const services = readJSON("services.json");

  const user = users.find(u => u.id == req.query.id);

  res.render("user/new-request", { user, services });
});

app.post("/user/new-request", (req, res) => {
  const requests = readJSON("requests.json");

  const newRequest = {
    id: Date.now(),
    userId: req.body.userId,
    service: req.body.service,
    weight: req.body.weight,
    status: "pending",
    date: new Date().toISOString()
  };

  requests.push(newRequest);
  writeJSON("requests.json", requests);

  res.redirect(`/user/dashboard?id=${req.body.userId}`);
});

/* ============================
   ADMIN SECTION
============================ */

app.get("/admin/dashboard", (req, res) => {
  const users = readJSON("users.json");
  const user = users.find(u => u.id == req.query.id);
  const requests = readJSON("requests.json");

  res.render("admin/dashboard", { user, requests });
});

app.get("/admin/services", (req, res) => {
  const services = readJSON("services.json");
  res.render("admin/services", { services });
});

app.post("/admin/services/add", (req, res) => {
  const services = readJSON("services.json");
  services.push({
    id: Date.now(),
    name: req.body.name,
    description: req.body.description,
    price: req.body.price,
    status: "active"
  });

  writeJSON("services.json", services);
  res.redirect("/admin/services");
});

app.listen(3000, () => console.log("Server running on port 3000"));
