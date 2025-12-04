// -----------------------------------------------------------
//  LAUNDRY MANAGEMENT SYSTEM - FULL SERVER.JS (NO SHORT VERSION)
// -----------------------------------------------------------

const express = require("express");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------------
//  PATHS FOR DATA STORAGE
// -----------------------------------------------------------

const DATA_DIR = path.join(__dirname, "data");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const PRICING_FILE = path.join(DATA_DIR, "pricing.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

// -----------------------------------------------------------
//  ESSENTIAL MIDDLEWARE
// -----------------------------------------------------------

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Session
app.use(
    session({
        secret: "laundry_secret_key_123456789",
        resave: false,
        saveUninitialized: false,
    })
);

// -----------------------------------------------------------
//  CREATE DATA DIRECTORY + ESSENTIAL FILES IF NOT EXIST
// -----------------------------------------------------------

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

if (!fs.existsSync(ADMIN_FILE)) {
    fs.writeFileSync(
        ADMIN_FILE,
        JSON.stringify({
            username: "admin",
            password: bcrypt.hashSync("admin", 10),
        })
    );
}

if (!fs.existsSync(PRICING_FILE)) {
    fs.writeFileSync(PRICING_FILE, JSON.stringify([]));
}

if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([]));
}

// -----------------------------------------------------------
//  ADMIN AUTH MIDDLEWARE
// -----------------------------------------------------------

function auth(req, res, next) {
    if (!req.session.admin) return res.redirect("/admin/login");
    next();
}

// -----------------------------------------------------------
//  PUBLIC ROUTES (HOMEPAGE, PRICING, ORDER CREATION)
// -----------------------------------------------------------

// HOME PAGE
app.get("/", (req, res) => {
    try {
        res.render("index");
    } catch (err) {
        console.error("Error rendering homepage:", err);
        res.status(500).send("Internal server error");
    }
});

// PRICING PAGE (Public)
app.get("/pricing", (req, res) => {
    try {
        const pricing = JSON.parse(fs.readFileSync(PRICING_FILE));
        res.render("pricing", { pricing });
    } catch (err) {
        console.error("Error loading pricing:", err);
        res.status(500).send("Error loading pricing");
    }
});

// POST ORDER FROM PUBLIC
app.post("/order", (req, res) => {
    try {
        const orders = JSON.parse(fs.readFileSync(ORDERS_FILE));

        const newOrder = {
            id: Date.now(),
            name: req.body.name,
            phone: req.body.phone,
            address: req.body.address,
            service: req.body.service,
            weight: req.body.weight,
            note: req.body.note ?? "",
            createdAt: new Date().toISOString(),
            status: "Pending",
        };

        orders.push(newOrder);

        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));

        res.json({ success: true });
    } catch (err) {
        console.error("Error creating order:", err);
        res.status(500).json({ success: false, error: "Order failed" });
    }
});

// -----------------------------------------------------------
//  ADMIN LOGIN / LOGOUT
// -----------------------------------------------------------

// LOGIN PAGE
app.get("/admin/login", (req, res) => {
    res.render("admin/login", { error: null });
});

// LOGIN POST
app.post("/admin/login", (req, res) => {
    try {
        const admin = JSON.parse(fs.readFileSync(ADMIN_FILE));
        const { username, password } = req.body;

        if (username !== admin.username) {
            return res.render("admin/login", { error: "Invalid username" });
        }

        if (!bcrypt.compareSync(password, admin.password)) {
            return res.render("admin/login", { error: "Incorrect password" });
        }

        req.session.admin = true;
        res.redirect("/admin/dashboard");
    } catch (err) {
        console.error("Login error:", err);
        res.render("admin/login", { error: "Error processing login" });
    }
});

// LOGOUT
app.get("/admin/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/admin/login");
});

// -----------------------------------------------------------
//  ADMIN DASHBOARD
// -----------------------------------------------------------

app.get("/admin/dashboard", auth, (req, res) => {
    try {
        const orders = JSON.parse(fs.readFileSync(ORDERS_FILE));
        const pricing = JSON.parse(fs.readFileSync(PRICING_FILE));

        res.render("admin/dashboard", { orders, pricing });
    } catch (err) {
        console.error("Dashboard load error:", err);
        res.status(500).send("Dashboard failed");
    }
});

// -----------------------------------------------------------
//  PRICING MANAGEMENT (ADMIN)
// -----------------------------------------------------------

// MANAGE PRICING PAGE
app.get("/admin/pricing", auth, (req, res) => {
    try {
        const pricing = JSON.parse(fs.readFileSync(PRICING_FILE));
        res.render("admin/pricing", { pricing });
    } catch (err) {
        console.error("Pricing load error:", err);
        res.status(500).send("Pricing page error");
    }
});

// ADD NEW PRICE ITEM
app.post("/admin/pricing/add", auth, (req, res) => {
    try {
        const pricing = JSON.parse(fs.readFileSync(PRICING_FILE));

        const newPrice = {
            id: Date.now(),
            name: req.body.name,
            price: req.body.price,
        };

        pricing.push(newPrice);

        fs.writeFileSync(PRICING_FILE, JSON.stringify(pricing, null, 2));

        res.redirect("/admin/pricing");
    } catch (err) {
        console.error("Pricing add error:", err);
        res.status(500).send("Failed to add pricing");
    }
});

// DELETE PRICE ITEM
app.post("/admin/pricing/delete/:id", auth, (req, res) => {
    try {
        let pricing = JSON.parse(fs.readFileSync(PRICING_FILE));

        const id = req.params.id;

        pricing = pricing.filter(item => item.id != id);

        fs.writeFileSync(PRICING_FILE, JSON.stringify(pricing, null, 2));

        res.redirect("/admin/pricing");
    } catch (err) {
        console.error("Pricing delete error:", err);
        res.status(500).send("Delete failed");
    }
});

// -----------------------------------------------------------
//  ORDER MANAGEMENT (ADMIN)
// -----------------------------------------------------------

// ORDERS PAGE
app.get("/admin/orders", auth, (req, res) => {
    try {
        const orders = JSON.parse(fs.readFileSync(ORDERS_FILE));
        res.render("admin/orders", { orders });
    } catch (err) {
        console.error("Order load error:", err);
        res.status(500).send("Order page error");
    }
});

// UPDATE ORDER STATUS
app.post("/admin/orders/status/:id", auth, (req, res) => {
    try {
        let orders = JSON.parse(fs.readFileSync(ORDERS_FILE));

        let order = orders.find(o => o.id == req.params.id);

        if (!order) return res.status(404).send("Order not found");

        order.status = req.body.status;

        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));

        res.redirect("/admin/orders");
    } catch (err) {
        console.error("Order status update error:", err);
        res.status(500).send("Failed to update status");
    }
});

// DELETE ORDER
app.post("/admin/orders/delete/:id", auth, (req, res) => {
    try {
        let orders = JSON.parse(fs.readFileSync(ORDERS_FILE));

        orders = orders.filter(o => o.id != req.params.id);

        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));

        res.redirect("/admin/orders");
    } catch (err) {
        console.error("Order delete error:", err);
        res.status(500).send("Failed to delete order");
    }
});

// -----------------------------------------------------------
//  START SERVER
// -----------------------------------------------------------

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
