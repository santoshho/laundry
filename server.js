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

// Helpers
const readJSON = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file)));
const writeJSON = (file, data) => fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2));

/* ================================
   AUTH PAGES
================================ */

app.get("/", (req, res) => {
  res.render("auth/login");
});

app.get("/register", (req, res) => {
  res.render("auth/register");
});

app.post("/register", (req, res) => {
  const users = readJSON("users.json");
  const { name, email, password } = req.body;

  users.push({
    id: Date.now(),
    name,
    email,
    password,
    role: "user"
  });

  writeJSON("users.json", users);
  res.redirect("/");
});

app.post("/login", (req, res) => {
  const users = readJSON("users.json");
  const { email, password } = req.body;

  const user = users.find(u => u.email === email && u.password === password);

  if (!user) return res.send("Invalid credentials");

  if (user.role === "admin") {
    res.redirect(`/admin/dashboard?id=${user.id}`);
  } else {
    res.redirect(`/user/dashboard?id=${user.id}`);
  }
});

/* ================================
   USER DASHBOARD
================================ */

app.get("/user/dashboard", (req, res) => {
  const users = readJSON("users.json");
  const requests = readJSON("requests.json");

  const user = users.find(u => u.id == req.query.id);
  const orders = requests.filter(r => r.userId == req.query.id);

  res.render("user/dashboard", { user, orders });
});

/* ================================
   CREATE REQUEST (OLD WORKING)
================================ */

app.get("/user/new-request", (req, res) => {
  const users = readJSON("users.json");
  const services = readJSON("services.json");

  const user = users.find(u => u.id == req.query.id);

  res.render("user/new-request", { user, services });
});

app.post("/user/new-request", (req, res) => {
  const requests = readJSON("requests.json");

  requests.push({
    id: Date.now(),
    userId: req.body.userId,
    service: req.body.service,
    items: req.body.items,
    status: "pending",
    created_at: new Date().toISOString()
  });

  writeJSON("requests.json", requests);

  res.redirect(`/user/dashboard?id=${req.body.userId}`);
});

/* ================================
   ADMIN DASHBOARD
================================ */

app.get("/admin/dashboard", (req, res) => {
  const users = readJSON("users.json");
  const requests = readJSON("requests.json");

  const admin = users.find(u => u.id == req.query.id);

  res.render("admin/dashboard", { admin, requests });
});

app.listen(3000, () => console.log("Server running on port 3000"));
