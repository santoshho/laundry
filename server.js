const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// Paths
const DATA_DIR = path.join(__dirname, "data");
const PRICING_FILE = path.join(DATA_DIR, "pricing.json");

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Admin credentials
const ADMIN_EMAIL = "admin@gmail.com";
const ADMIN_PASSWORD_HASH =
    "$2a$10$k3x3g9MqU0lEVKcW9F6qeOiO1Y8vGZZoRmsx8bwyq9e8MLsBecJeK"; // password = admin123

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(
    session({
        secret: "supersecurekey",
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 24 * 60 * 60 * 1000 }
    })
);

// Multer (for future image uploads)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "public/uploads"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// -----------------------------------
// Utility
// -----------------------------------
function loadPricing() {
    if (!fs.existsSync(PRICING_FILE)) return [];
    return JSON.parse(fs.readFileSync(PRICING_FILE, "utf8"));
}

function savePricing(data) {
    fs.writeFileSync(PRICING_FILE, JSON.stringify(data, null, 2));
}

// -----------------------------------
// Auth Middleware
// -----------------------------------
function isAdmin(req, res, next) {
    if (req.session && req.session.admin) return next();
    return res.redirect("/admin/login");
}

// -----------------------------------
// ROUTES
// -----------------------------------

// Home Page
app.get("/", (req, res) => {
    const services = loadPricing();
    res.render("index", { services });
});

// Admin Login Page
app.get("/admin/login", (req, res) => {
    res.render("login", { error: null });
});

// Handle Login
app.post("/admin/login", async (req, res) => {
    const { email, password } = req.body;

    if (email !== ADMIN_EMAIL) {
        return res.render("login", { error: "Invalid email" });
    }

    const match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
    if (!match) {
        return res.render("login", { error: "Incorrect password" });
    }

    req.session.admin = true;
    res.redirect("/admin");
});

// Logout
app.get("/admin/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/admin/login");
    });
});

// Admin Dashboard
app.get("/admin", isAdmin, (req, res) => {
    res.render("admin/dashboard");
});

// -----------------------------------
// Pricing Management
// -----------------------------------
app.get("/admin/pricing", isAdmin, (req, res) => {
    const pricing = loadPricing();
    res.render("admin/pricing", { pricing });
});

app.post("/admin/pricing/add", isAdmin, (req, res) => {
    const { name, description, pricePerKg } = req.body;

    const pricing = loadPricing();
    pricing.push({
        id: Date.now(),
        name,
        description,
        pricePerKg: Number(pricePerKg)
    });

    savePricing(pricing);
    res.redirect("/admin/pricing");
});

app.post("/admin/pricing/delete/:id", isAdmin, (req, res) => {
    const id = Number(req.params.id);

    let pricing = loadPricing();
    pricing = pricing.filter(item => item.id !== id);

    savePricing(pricing);
    res.redirect("/admin/pricing");
});

// -----------------------------------
// Start Server
// -----------------------------------
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
