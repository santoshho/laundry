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
    fs.writeFileSync(
        path.join(__dirname, filename),
        JSON.stringify(data, null, 2)
    );
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
// HOME ROUTE
// =============================
app.get("/", (req, res) => {
    res.render("index");
});

// =============================
// =============================
// USER AUTH
// =============================
// =============================
app.get("/login", (req, res) => res.render("login"));
app.get("/register", (req, res) => res.render("register"));

app.post("/login", (req, res) => {
    const { email, password } = req.body;
    const users = readJSON("users.json");

    const user = users.find(
        u => u.email === email && u.password === password
    );

    if (!user) return res.render("login", { error: "Invalid credentials" });

    req.session.user = {
        id: user.id,
        email: user.email,
        phone: user.phone,
        username: `${user.first_name} ${user.last_name}`,
    };

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

    req.session.user = {
        id: newUser.id,
        email: newUser.email,
        phone: newUser.phone,
        username: `${newUser.first_name} ${newUser.last_name}`,
    };

    res.redirect("/user/dashboard");
});

// =============================
// USER DASHBOARD
// =============================
app.get("/user/dashboard", (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    const orders = readJSON("orders.json");

    const myOrders = orders.filter(
        o =>
            o.userId === req.session.user.id ||
            o.phone === req.session.user.phone
    );

    res.render("user/dashboard", { orders: myOrders });
});

// =============================
// USER NOTIFICATIONS
// =============================
app.get("/user/notifications", (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    const notes = readJSON("notifications.json");

    const myNotes = notes.filter(
        n =>
            n.userId === req.session.user.id ||
            n.phone === req.session.user.phone
    );

    res.render("user/notifications", { notifications: myNotes });
});

// =============================
// USER REQUEST DETAILS
// =============================
app.get("/user/request-details", (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    const orders = readJSON("orders.json");
    const order = orders.find(o => o.id === req.query.id);

    res.render("user/request-details", { order });
});

// =============================
// =============================
// ADMIN SYSTEM
// =============================
// =============================
app.get("/admin/login", (req, res) => res.render("admin/login"));

app.post("/admin/login", (req, res) => {
    const { username, password } = req.body;

    if (username === "admin" && password === "admin123") {
        req.session.admin = true;
        return res.redirect("/admin/dashboard");
    }

    res.render("admin/login", { error: "Invalid admin credentials" });
});

// ADMIN DASHBOARD
app.get("/admin/dashboard", (req, res) => {
    if (!req.session.admin) return res.redirect("/admin/login");

    const orders = readJSON("orders.json");
    res.render("admin/dashboard", { orders });
});

// ADMIN ORDER LIST
app.get("/admin/orders", (req, res) => {
    if (!req.session.admin) return res.redirect("/admin/login");

    const orders = readJSON("orders.json");
    res.render("admin/orders", { orders });
});

// ADMIN UPDATE ORDER STATUS — CREATES NOTIFICATION
app.post("/admin/update-status", (req, res) => {
    if (!req.session.admin) return res.redirect("/admin/login");

    const { orderId, status } = req.body;
    const orders = readJSON("orders.json");

    const order = orders.find(o => o.id === orderId);
    if (!order) return res.redirect("/admin/orders");

    order.status = status;
    writeJSON("orders.json", orders);

    // add notification
    const notes = readJSON("notifications.json");

    notes.push({
        id: Date.now().toString(),
        userId: order.userId,
        phone: order.phone,
        message: `Your order #${order.id} status is updated to ${status}`,
        time: new Date().toISOString(),
        read: false,
    });

    writeJSON("notifications.json", notes);

    res.redirect("/admin/orders");
});

// =============================
// WILDCARD MUST BE LAST — KEEP IT LAST
// =============================
app.get("/:page", (req, res) => {
    const file = path.join(__dirname, "views", `${req.params.page}.ejs`);
    if (fs.existsSync(file)) return res.render(req.params.page);
    res.status(404).render("404");
});

// =============================
// START SERVER
// =============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
