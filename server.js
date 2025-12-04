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

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Load helper function
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

// Sessions
app.use(
    session({
        secret: "laundry_secret_123",
        resave: false,
        saveUninitialized: true,
    })
);

// Protect admin dashboard
function adminAuth(req, res, next) {
    if (!req.session.admin) return res.redirect("/admin/login");
    next();
}

/* ------------------------------------------------------------------
   USER ROUTES
--------------------------------------------------------------------*/

// USER HOME
app.get("/", (req, res) => {
    res.render("index");
});

// USER LOGIN PAGE
app.get("/login", (req, res) => {
    res.render("login", { error: null });
});

// USER REGISTER PAGE
app.get("/register", (req, res) => {
    res.render("register", { error: null });
});

// USER REGISTER PROCESS
app.post("/register", (req, res) => {
    const { name, email, password } = req.body;
    const users = load(USERS_FILE);

    if (users.find((u) => u.email === email)) {
        return res.render("register", { error: "Email already exists!" });
    }

    const hashed = bcrypt.hashSync(password, 10);

    users.push({
        id: Date.now(),
        name,
        email,
        password: hashed,
    });

    save(USERS_FILE, users);
    res.redirect("/login");
});

// USER LOGIN PROCESS
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    const users = load(USERS_FILE);
    const user = users.find((u) => u.email === email);

    if (!user) {
        return res.render("login", { error: "Invalid email!" });
    }

    if (!bcrypt.compareSync(password, user.password)) {
        return res.render("login", { error: "Incorrect password!" });
    }

    req.session.user = user;
    res.redirect("/");
});

// USER LOGOUT
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

/* ------------------------------------------------------------------
   ADMIN ROUTES
--------------------------------------------------------------------*/

// DEFAULT ADMIN USER (admin/admin)
function ensureAdminUser() {
    let users = load(USERS_FILE);

    if (!users.find((u) => u.email === "admin@laundry.com")) {
        users.push({
            id: 1,
            name: "Admin",
            email: "admin@laundry.com",
            password: bcrypt.hashSync("admin", 10),
            admin: true,
        });
        save(USERS_FILE, users);
    }
}
ensureAdminUser();

// ADMIN LOGIN PAGE
app.get("/admin/login", (req, res) => {
    res.render("admin/login", { error: null });
});

// ADMIN LOGIN PROCESS
app.post("/admin/login", (req, res) => {
    const { email, password } = req.body;

    const users = load(USERS_FILE);
    const admin = users.find((u) => u.email === email && u.admin);

    if (!admin) {
        return res.render("admin/login", { error: "Admin not found!" });
    }

    if (!bcrypt.compareSync(password, admin.password)) {
        return res.render("admin/login", { error: "Incorrect password!" });
    }

    req.session.admin = admin;
    res.redirect("/admin/dashboard");
});

// ADMIN DASHBOARD
app.get("/admin/dashboard", adminAuth, (req, res) => {
    const pricing = load(PRICING_FILE);
    const orders = load(ORDERS_FILE);

    res.render("admin/dashboard", {
        pricingCount: pricing.length,
        orderCount: orders.length,
    });
});

/* ------------------------------------------------------------------
   ADMIN PRICING
--------------------------------------------------------------------*/

app.get("/admin/pricing", adminAuth, (req, res) => {
    const pricing = load(PRICING_FILE);
    res.render("admin/pricing", { pricing });
});

// SAVE or UPDATE PRICING
app.post("/admin/pricing", adminAuth, (req, res) => {
    const { pricing_id, name, price, unit } = req.body;

    const pricing = load(PRICING_FILE);

    if (pricing_id) {
        // UPDATE
        const item = pricing.find((p) => p.id == pricing_id);
        if (item) {
            item.name = name;
            item.price = price;
            item.unit = unit;
        }
    } else {
        // ADD NEW
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

// DELETE PRICING
app.post("/admin/pricing/:id/delete", adminAuth, (req, res) => {
    let pricing = load(PRICING_FILE);
    pricing = pricing.filter((p) => p.id != req.params.id);
    save(PRICING_FILE, pricing);

    res.redirect("/admin/pricing");
});

/* ------------------------------------------------------------------
   ADMIN ORDERS
--------------------------------------------------------------------*/

app.get("/admin/orders", adminAuth, (req, res) => {
    const orders = load(ORDERS_FILE);
    res.render("admin/orders", { orders });
});

/* ------------------------------------------------------------------
   START SERVER
--------------------------------------------------------------------*/

app.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`)
);
