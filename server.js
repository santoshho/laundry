// =============================
// Required modules
// =============================
const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");

const app = express();

// =============================
// Helpers
// =============================
function readJSON(filename) {
    try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, filename)));
    } catch (err) {
        return [];
    }
}

function writeJSON(filename, data) {
    fs.writeFileSync(path.join(__dirname, filename), JSON.stringify(data, null, 2));
}

// =============================
// App Settings
// =============================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(
    session({
        secret: "supersecretkey",
        resave: false,
        saveUninitialized: false,
    })
);

// =============================
// SESSION MIDDLEWARE
// =============================
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.admin = req.session.admin || null;
    next();
});

// =============================
// HOME
// =============================
app.get("/", (req, res) => {
    res.render("index");
});

// =============================
// USER AUTH
// =============================
app.get("/login", (req, res) => res.render("login"));
app.get("/register", (req, res) => res.render("register"));

app.post("/login", (req, res) => {
    const { email, password } = req.body;
    const users = readJSON("users.json");

    const user = users.find(u => u.email === email && u.password === password);

    if (!user) return res.render("login", { error: "Invalid credentials" });

    req.session.user = user;
    res.redirect("/user/dashboard");
});

app.post("/register", (req, res) => {
    const users = readJSON("users.json");

    const newUser = {
        id: Date.now().toString(),
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        email: req.body.email,
        phone: req.body.phone,
        password: req.body.password,
    };

    users.push(newUser);
    writeJSON("users.json", users);

    req.session.user = newUser;
    res.redirect("/user/dashboard");
});

// =============================
// USER DASHBOARD
// =============================
app.get("/user/dashboard", (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    const orders = readJSON("orders.json");

    const myOrders = orders.filter(o => o.userId === req.session.user.id);

    res.render("user/dashboard", { orders: myOrders });
});

// =============================
// NOTIFICATIONS
// =============================
app.get("/user/notifications", (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    const notes = readJSON("notifications.json");

    const myNotes = notes.filter(n => n.userId === req.session.user.id);

    res.render("user/notifications", { notifications: myNotes });
});

// =============================
// ADMIN ROUTES
// =============================
app.get("/admin/login", (req, res) => res.render("admin/login"));

app.post("/admin/login", (req, res) => {
    const { username, password } = req.body;

    if (username === "admin" && password === "admin123") {
        req.session.admin = { username: "admin" };
        return res.redirect("/admin/dashboard");
    }

    res.render("admin/login", { error: "Invalid admin login" });
});

app.get("/admin/dashboard", (req, res) => {
    if (!req.session.admin) return res.redirect("/admin/login");

    const orders = readJSON("orders.json");
    res.render("admin/dashboard", { orders });
});

// =============================
// ADMIN UPDATE ORDER STATUS
// =============================
app.post("/admin/order/:id/status", (req, res) => {
    if (!req.session.admin) return res.redirect("/admin/login");

    const orders = readJSON("orders.json");
    const notes = readJSON("notifications.json");

    const id = req.params.id;
    const { status } = req.body;

    const order = orders.find(o => o.id == id);
    if (!order) return res.send("Order not found");

    order.status = status;

    // send notification to user
    notes.push({
        id: Date.now(),
        userId: order.userId,
        message: `Your order #${order.id} status changed to: ${status}`,
        time: new Date()
    });

    writeJSON("orders.json", orders);
    writeJSON("notifications.json", notes);

    res.redirect("/admin/dashboard");
});

// =============================
// START SERVER
// =============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on " + PORT));
