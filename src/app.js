// use to live server with PM2...

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// Routes
const authRoutes = require("./routes/authRoutes");
const ownerRoutes = require("./routes/ownerRoutes");

const app = express();

/* =====================
   1. Setup Directories
===================== */
const uploadDir = path.join(__dirname, "../uploads");
const distPath = path.join(__dirname, "../dist");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* =====================
   2. Middleware
===================== */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

/* =====================
   3. Static Files
===================== */
app.use("/uploads", express.static(uploadDir));
app.use(express.static(distPath));

/* =====================
   4. API Routes
===================== */
app.use("/api/auth", authRoutes);
app.use("/api/products", ownerRoutes);
app.use("/api/cart", ownerRoutes);
app.use("/api/categories", ownerRoutes);
app.use("/api/orders", ownerRoutes);
app.use("/api", ownerRoutes);
app.use("/api/v1/user", ownerRoutes);

/* =====================
   5. React Catch-All Route
===================== */
// IMPORTANT: Keep this after all API routes
app.use((req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

module.exports = app;


























// const express = require("express");
// const cors = require("cors");
// const path = require("path");

// const authRoutes = require("./routes/authRoutes");
// const ownerRoutes = require("./routes/ownerRoutes");

// const app = express();

// /* =====================
//    Middleware
// ===================== */
// app.use(cors()); // allow same server requests

// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// /* =====================
//    API Routes
// ===================== */
// app.use("/api", authRoutes);
// app.use(ownerRoutes);

// /* ===============================
//    Serve React dist
// ================================ */
// const distPath = path.join(__dirname, "../dist");

// app.use(express.static(distPath));

// // Catch-all for React Router
// app.use((req, res) => {
//   res.sendFile(path.join(distPath, "index.html"));
// });

// app.use("/images", express.static(path.join(__dirname, "assetsthis")));

// module.exports = app;










// // local server to use ...

// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// const fs = require("fs");

// // Routes
// const authRoutes = require("./routes/authRoutes");
// const ownerRoutes = require("./routes/ownerRoutes");

// const app = express();

// // Create uploads folder if it doesn't exist
// const uploadDir = path.join(__dirname, "../uploads");

// if (!fs.existsSync(uploadDir)) {
//     fs.mkdirSync(uploadDir, { recursive: true });
// }

// // Middleware
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // CORS Configuration
// app.use(
//     cors({
//         origin: true,          // Allow requests from your PC and mobile during development
//         credentials: true,
//     })
// );

// // Static Files
// app.use("/uploads", express.static(uploadDir));

// // Routes
// app.use("/api/auth", authRoutes);

// app.use("/api/products", ownerRoutes);
// app.use("/api/cart", ownerRoutes);
// app.use("/api/categories", ownerRoutes);
// app.use("/api/orders", ownerRoutes);
// app.use("/api", ownerRoutes);
// app.use("/api/v1/user", ownerRoutes);

// module.exports = app;