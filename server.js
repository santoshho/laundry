const express = require("express");
const app = express();
const fs = require("fs");
const path = require("path");
const session = require("express-session");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Public folder
app.use(express.static("public"));

// View engine
app.set("view engine", "ejs");

// Sessions
app.use(
    session({
        secret: "secret123",
        resave: false,
        saveUninitialized: false,
    })
);

// JSON file locations
const usersFile = "./data/users.json";
const ordersFile = "./data/orders.json";
const adminFile = "./data/admin.json";

// Load JSON safely
function loadJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (err) {
        return [];
    }
}

// Save JSON safely
function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Load initial data
let users = loadJSON(usersFile);
let orders = loadJSON(ordersFile);
let admins = loadJSON(adminFile);

// ------------------------
// AUTH MIDDLEWARE
// ------------------------
function userAuth(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    next();
}

function adminAuth(req, res, next) {
    if (!req.session.admin) return res.redirect("/admin/login");
    next();
}

// ------------------------
// ROUTES
// ------------------------

//
// HOME
//
app.get("/", (req, res) => {
    res.render("index");
});

//
// USER REGISTER
//
app.get("/register", (req, res) => {
    res.render("register");
});

app.post("/register", (req, res) => {
    const { name, email, password } = req.body;

    if (users.find((u) => u.email === email)) {
        return res.send("Email already exists!");
    }

    users.push({ id: Date.now(), name, email, password });
    saveJSON(usersFile, users);

    res.redirect("/login");
});

//
// USER LOGIN
//
app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", (req, res) => {
    const { email, password } = req.body;

    const user = users.find(
        (u) => u.email === email && u.password === password
    );

    if (!user) return res.send("Invalid email or password");

    req.session.user = user;
    res.redirect("/user/dashboard");
});

//
// USER DASHBOARD
//
app.get("/user/dashboard", userAuth, (req, res) => {
    const userOrders = orders.filter((o) => o.user_id === req.session.user.id);
    res.render("user/dashboard", { user: req.session.user, orders: userOrders });
});

//
// NEW REQUEST PAGE
//
app.get("/user/new-request", userAuth, (req, res) => {
    res.render("user/new-request");
});

//
// PAYMENT PAGE (NEW)
//
app.get("/user/payment", userAuth, (req, res) => {
    const { service, kg, price } = req.query;

    if (!service || !kg || !price) {
        return res.redirect("/user/new-request");
    }

    res.render("user/payment", {
        service,
        kg,
        price,
        total: price * kg,
    });
});

//
// SUBMIT PAYMENT (CREATES ORDER)
//
app.post("/user/submit-payment", userAuth, (req, res) => {
    const { service, kg, total, payment_method } = req.body;

    const newOrder = {
        id: Date.now(),
        user_id: req.session.user.id,
        service,
        kg,
        total,
        payment_method,
        status: "pending",
        created_at: new Date(),
    };

    orders.push(newOrder);
    saveJSON(ordersFile, orders);

    res.redirect("/user/requests");
});

//
// USER REQUEST LIST
//
app.get("/user/requests", userAuth, (req, res) => {
    const userOrders = orders.filter((o) => o.user_id === req.session.user.id);
    res.render("user/requests", { orders: userOrders });
});

//
// USER REQUEST DETAILS
//
app.get("/user/request-details", userAuth, (req, res) => {
    const order = orders.find((o) => o.id == req.query.id);
    if (!order) return res.send("Order not found");

    res.render("user/request-details", { order });
});

//
// ADMIN LOGIN
//
app.get("/admin/login", (req, res) => {
    res.render("admin/login");
});

app.post("/admin/login", (req, res) => {
    const { username, password } = req.body;

    const admin = admins.find(
        (a) => a.username === username && a.password === password
    );

    if (!admin) return res.send("Invalid admin credentials");

    req.session.admin = admin;
    res.redirect("/admin/dashboard");
});

//
// ADMIN DASHBOARD
//
app.get("/admin/dashboard", adminAuth, (req, res) => {
    res.render("admin/dashboard", { orders });
});

//
// ADMIN UPDATE ORDER STATUS
//
app.post("/admin/update-status", adminAuth, (req, res) => {
    const { id, status } = req.body;

    const order = orders.find((o) => o.id == id);
    if (!order) return res.send("Order not found");

    order.status = status;
    saveJSON(ordersFile, orders);

    res.redirect("/admin/dashboard");
});

//
// LOGOUT
//
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

// ------------------------
// START SERVER
// ------------------------
app.listen(3000, () => console.log("Server running on port 3000"));
