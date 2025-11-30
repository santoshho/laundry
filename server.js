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
    next();
});

// =============================
// USER LOGIN
// =============================
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

// =============================
// USER REGISTER
// =============================
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
// HOME ROUTE
// =============================
app.get("/", (req, res) => {
    res.render("index");
});

// =============================
// ADMIN PAGES (STATIC RENDER)
// =============================
app.get("/admin/login", (req, res) => {
    res.render("admin/login");
});

app.get("/admin/dashboard", (req, res) => {
    res.render("admin/dashboard");
});

// =============================
// SAVE UNKNOWN FORM
// =============================
app.post("/save-form", (req, res) => {
    const forms = readJSON("forms.json");
    forms.push({ id: Date.now(), data: req.body });
    writeJSON("forms.json", forms);
    res.json({ success: true });
});

// =============================
// START SERVER
// =============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
