const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();

// ====== DATABASE SETUP ======
const dbFile = "./laundry.db";
const dbExists = fs.existsSync(dbFile);

const db = new sqlite3.Database(dbFile);

if (!dbExists) {
    db.serialize(() => {
        db.run(`
            CREATE TABLE admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password_hash TEXT
            )
        `);

        db.run(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                phone TEXT UNIQUE,
                address TEXT
            )
        `);

        db.run(`
            CREATE TABLE orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                service TEXT,
                weight REAL,
                status TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        `);

        const defaultAdminHash = bcrypt.hashSync("admin", 8);
        db.run(
            "INSERT INTO admins (username, password_hash) VALUES (?, ?)",
            ["admin", defaultAdminHash]
        );

        console.log("Database initialized.");
    });
}

// ====== MIDDLEWARE ======
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
    session({
        secret: "supersecretkey",
        resave: false,
        saveUninitialized: true,
    })
);

app.use(express.static(path.join(__dirname, "public")));

// ====== AUTH CHECK ======
function authRequired(req, res, next) {
    if (!req.session.admin) return res.redirect("/admin/login");
    next();
}

// ====== ROUTES ======

// Home (client order page)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

// Admin Login Page
app.get("/admin/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public/admin-login.html"));
});

// Admin Login POST
app.post("/admin/login", (req, res) => {
    const { username, password } = req.body;

    db.get(
        "SELECT * FROM admins WHERE username = ?",
        [username],
        (err, admin) => {
            if (err) return res.send("Server error");

            if (!admin) return res.send("Invalid admin credentials");

            bcrypt.compare(password, admin.password_hash, (err, match) => {
                if (!match) return res.send("Invalid admin credentials");

                req.session.admin = admin;
                return res.redirect("/admin/dashboard");
            });
        }
    );
});

// Admin Dashboard
app.get("/admin/dashboard", authRequired, (req, res) => {
    res.sendFile(path.join(__dirname, "public/admin-dashboard.html"));
});

// ====== CREATE ORDER (IMPORTANT) ======
app.post("/create-order", (req, res) => {
    const { name, phone, address, service, weight } = req.body;

    if (!name || !phone || !service) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    db.get("SELECT * FROM users WHERE phone = ?", [phone], (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });

        if (!user) {
            db.run(
                "INSERT INTO users (name, phone, address) VALUES (?, ?, ?)",
                [name, phone, address],
                function (err) {
                    if (err) return res.status(500).json({ error: "User create failed" });

                    createOrder(this.lastID);
                }
            );
        } else {
            createOrder(user.id);
        }
    });

    function createOrder(userId) {
        db.run(
            "INSERT INTO orders (user_id, service, weight, status) VALUES (?, ?, ?, ?)",
            [userId, service, weight || 0, "Pending"],
            function (err) {
                if (err) return res.status(500).json({ error: "Order create failed" });

                return res.json({
                    success: true,
                    order_id: this.lastID,
                    message: "Order created successfully"
                });
            }
        );
    }
}

// ====== ADMIN: GET ALL ORDERS ======
app.get("/admin/orders", authRequired, (req, res) => {
    db.all(
        `
        SELECT orders.id, users.name, users.phone, orders.service, orders.weight, orders.status, orders.created_at
        FROM orders
        JOIN users ON users.id = orders.user_id
        ORDER BY orders.id DESC
        `,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: "Database error" });
            res.json(rows);
        }
    );
});

// ====== ADMIN: UPDATE ORDER STATUS ======
app.post("/admin/update-status", authRequired, (req, res) => {
    const { order_id, status } = req.body;

    db.run(
        "UPDATE orders SET status = ? WHERE id = ?",
        [status, order_id],
        (err) => {
            if (err) return res.status(500).json({ error: "Failed to update" });

            res.json({ success: true });
        }
    );
});

// ====== LOGOUT ======
app.get("/admin/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/admin/login");
});

// ====== SERVER START ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
