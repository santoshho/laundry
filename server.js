//////////////////////////////////////////////////////////////////
// LAUNDRY SYSTEM – FULLY FIXED SERVER.JS
//////////////////////////////////////////////////////////////////

const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3000;

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PRICING_FILE = path.join(DATA_DIR, "pricing.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const SERVICES_FILE = path.join(DATA_DIR, "services.json");

// Ensure folder
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// File helpers
function load(file) {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file));
}
function save(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session
app.use(
    session({
        secret: "laundry_secret_123",
        resave: false,
        saveUninitialized: false,
    })
);

////////////////////////////////////////////////////////////////////
// FIX 1 — Create Admin User
////////////////////////////////////////////////////////////////////
function ensureAdmin() {
    let users = load(USERS_FILE);

    let admin = users.find(u => u.email === "admin@laundry.com");

    if (!admin) {
        users.push({
            id: Date.now(),
            first_name: "Admin",
            last_name: "",
            email: "admin@laundry.com",
            password_hash: bcrypt.hashSync("admin", 10),
            admin: true
        });

        save(USERS_FILE, users);
    }
}
ensureAdmin();

// Auth middleware
function adminAuth(req, res, next) {
    if (!req.session.admin) return res.redirect("/admin/login");
    next();
}

////////////////////////////////////////////////////////////////////
// USER ROUTES
////////////////////////////////////////////////////////////////////

// HOME PAGE
app.get("/", (req, res) => {
    const pricing = load(PRICING_FILE);
    const services = load(SERVICES_FILE); // for SC1 list

    res.render("index", {
        services,
        pricing,
        user: req.session.user,
    });
});

// LOGIN PAGE
app.get("/login", (req, res) => {
    res.render("login", { error: null });
});

// REGISTER PAGE
app.get("/register", (req, res) => {
    res.render("register", { error: null });
});

// REGISTER PROCESS
app.post("/register", (req, res) => {
    const { first_name, last_name, email, phone, password } = req.body;

    const users = load(USERS_FILE);

    if (users.find(u => u.email === email)) {
        return res.render("register", { error: "Email already exists!" });
    }

    const hashed = bcrypt.hashSync(password, 10);

    users.push({
        id: Date.now(),
        first_name,
        last_name,
        email,
        phone,
        password_hash: hashed,
        admin: false,
        created_at: new Date(),
    });

    save(USERS_FILE, users);
    res.redirect("/login");
});

// LOGIN PROCESS
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    const users = load(USERS_FILE);
    const user = users.find(u => u.email === email);

    if (!user) return res.render("login", { error: "Email does not exist." });

    if (!bcrypt.compareSync(password, user.password_hash)) {
        return res.render("login", { error: "Incorrect password." });
    }

    req.session.user = user;
    res.redirect("/");
});

// LOGOUT
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

////////////////////////////////////////////////////////////////////
// ADMIN ROUTES
////////////////////////////////////////////////////////////////////

// ADMIN LOGIN PAGE
app.get("/admin/login", (req, res) => {
    res.render("admin/login", { error: null });
});

// ADMIN LOGIN PROCESS
app.post("/admin/login", (req, res) => {
    const { email, password } = req.body;

    const users = load(USERS_FILE);
    const admin = users.find(u => u.email === email && u.admin);

    if (!admin) {
        return res.render("admin/login", { error: "Admin not found!" });
    }

    if (!bcrypt.compareSync(password, admin.password_hash)) {
        return res.render("admin/login", { error: "Incorrect password!" });
    }

    req.session.admin = admin;
    res.redirect("/admin/dashboard");
});

// DASHBOARD
app.get("/admin/dashboard", adminAuth, (req, res) => {
    const pricing = load(PRICING_FILE);
    const orders = load(ORDERS_FILE);

    res.render("admin/dashboard", {
        pricingCount: pricing.length,
        orderCount: orders.length,
    });
});

////////////////////////////////////////////////////////////////////
// PRICING
////////////////////////////////////////////////////////////////////

app.get("/admin/pricing", adminAuth, (req, res) => {
    const pricing = load(PRICING_FILE);
    res.render("admin/pricing", { pricing });
});

app.post("/admin/pricing", adminAuth, (req, res) => {
    const { pricing_id, name, price, unit } = req.body;

    const pricing = load(PRICING_FILE);

    if (pricing_id) {
        let p = pricing.find(x => x.id == pricing_id);
        if (p) {
            p.name = name;
            p.price = price;
            p.unit = unit;
        }
    } else {
        pricing.push({
            id: Date.now(),
            name,
            price,
            unit,
        });
    }

    save(PRICING_FILE, pricing);
    res.redirect("/admin/pricing");
});

app.post("/admin/pricing/:id/delete", adminAuth, (req, res) => {
    let pricing = load(PRICING_FILE);
    pricing = pricing.filter(p => p.id != req.params.id);
    save(PRICING_FILE, pricing);

    res.redirect("/admin/pricing");
});

////////////////////////////////////////////////////////////////////
// START SERVER
////////////////////////////////////////////////////////////////////

app.listen(PORT, () =>
    console.log(`Server running at http://localhost:${PORT}`)
);
