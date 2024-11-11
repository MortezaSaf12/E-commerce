// ADMIN
const adminName = "Jerome";
const adminPassword = "1234";

// PACKAGES
const path = require("path");
const express = require("express");
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const session = require("express-session");
const exprhbs = require("express-handlebars");

// DATABASE
const sqlite3 = require("sqlite3").verbose();
const clientDatabase = new sqlite3.Database("clients.db");
const itemDatabase = new sqlite3.Database("inventory.db");

// SERVER CONFIG
const PORT = 4331;
const app = express();

// MIDDLEWARE
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(
  session({
    secret: "sessionsecret",
    resave: true,
    saveUninitialized: true,
  })
);

// Middleware to pass session data to handlebars
app.use((req, res, next) => {
  if (req.session.user) {
    res.locals.user = req.session.user;
  }
  next();
});

// SETUP handlebars
app.engine("handlebars", exprhbs.engine());
app.set("view engine", "handlebars");
app.set("views", "./views");

// CLIENT TABLE
clientDatabase.serialize(() => {
  clientDatabase.run(`
    CREATE TABLE IF NOT EXISTS users (
      UserId INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    )`);
});

// INVENTORY TABLE
itemDatabase.serialize(() => {
  itemDatabase.run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL
    )`);
});

// ROUTES

// Home page
app.get("/", (req, res) => {
  console.log("Default route");
  res.render("home.handlebars");
});

// About page
app.get("/about", (req, res) => {
  console.log("Route to About us");
  res.render("About.handlebars");
});

// List page - display all items in inventory
app.get("/list", (req, res) => {
  console.log("Route to our list");
  itemDatabase.all("SELECT * FROM inventory", (err, items) => {
    if (err) {
      return res.status(500).send("Error retrieving items");
    }
    res.render("List.handlebars", { items, isListPage: true });
  });
});

// Item details page
app.get("/item/:id", (req, res) => {
  const itemId = req.params.id;
  itemDatabase.get("SELECT * FROM inventory WHERE id = ?", [itemId], (err, item) => {
    if (err || !item) {
      return res.status(404).send("Item not found");
    }
    res.render("ItemDetails.handlebars", { item });
  });
});

// Contact page
app.get("/contact", (req, res) => {
  console.log("Route to our Contacts");
  res.render("Contact.handlebars");
});

// Login page
app.get("/login", (req, res) => {
  console.log("Route to our login page");
  res.render("Login.handlebars");
});

// Register page
app.get("/register", (req, res) => {
  console.log("Route to Register page");
  res.render("Register.handlebars");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Server error");
    }
    res.redirect("/");
  });
});

// Registration
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send("Username and password are required");
  }

  clientDatabase.get("SELECT * FROM users WHERE username = ?", [username], async (err, existingUser) => {
    if (err) {
      return res.status(500).send("Server error");
    }

    if (existingUser) {
      return res.status(400).send("Username is already taken");
    }

    const hashedPassword = await bcrypt.hash(password, 14);
    clientDatabase.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], (err) => {
      if (err) {
        return res.status(500).send("Server error");
      }
      res.redirect("/login");
    });
  });
});

// Create Item page
app.get("/CreateItem", (req, res) => {
  console.log("Route to Create Item");
  res.render("CreateItem.handlebars");
});

// Login user logic
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (username === adminName && password === adminPassword) {
    req.session.user = { username: adminName, isAdmin: true };
    return res.redirect("/");
  }

  clientDatabase.get("SELECT * FROM users WHERE username=?", [username], async (err, user) => {
    if (err) {
      res.status(500).send("Server Error");
    } else if (!user) {
      res.status(401).send("User not found");
    } else {
      const result = await bcrypt.compare(password, user.password);
      if (result) {
        req.session.user = user;
        res.redirect("/");
      } else {
        res.status(401).send("Wrong Password");
      }
    }
  });
});

// Middleware to protect admin routes
function adminOnly(req, res, next) {
  if (req.session.user && req.session.user.isAdmin) {
    next();
  } else {
    res.status(403).send("Access denied. Admins only.");
  }
}

// Admin-only routes for creating, updating, and deleting items
app.post("/CreateItem", adminOnly, (req, res) => {
  const { name, description, price, quantity } = req.body;
  itemDatabase.run("INSERT INTO inventory (name, description, price, quantity) VALUES (?, ?, ?, ?)", [name, description, price, quantity], (err) => {
    if (err) {
      return res.status(500).send("Error adding item.");
    }
    res.redirect("/list");
  });
});

app.get("/item/:id/edit", adminOnly, (req, res) => {
  const itemId = req.params.id;
  itemDatabase.get("SELECT * FROM inventory WHERE id = ?", [itemId], (err, item) => {
    if (err || !item) {
      return res.status(404).send("Item not found");
    }
    res.render("EditItem.handlebars", { item });
  });
});

app.post("/item/:id/update", adminOnly, (req, res) => {
  const { id } = req.params;
  const { name, description, price, quantity } = req.body;
  itemDatabase.run("UPDATE inventory SET name = ?, description = ?, price = ?, quantity = ? WHERE id = ?", [name, description, price, quantity, id], (err) => {
    if (err) {
      return res.status(500).send("Error updating item.");
    }
    res.redirect("/list");
  });
});

app.post("/item/:id/delete", adminOnly, (req, res) => {
  const itemId = req.params.id;
  itemDatabase.run("DELETE FROM inventory WHERE id = ?", [itemId], (err) => {
    if (err) {
      return res.status(500).send("Error deleting item.");
    }
    res.redirect("/list");
  });
});

// Admin-only secret page
app.get("/secret", adminOnly, (req, res) => {
  clientDatabase.all("SELECT * FROM users", (err, users) => {
    if (err) {
      return res.status(500).send("Error retrieving users.");
    }
    res.render("Secret.handlebars", { users });
  });
});

app.listen(PORT, function () {
  console.log("Server up and running, listening on port " + PORT + "... :)");
});
