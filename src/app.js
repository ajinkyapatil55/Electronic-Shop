// /**
//  * ============================================================================
//  * app.js
//  * ============================================================================
//  * Purpose:
//  * Main Express application setup for production / PM2 deployment.
//  *
//  * Features:
//  * 1. Creates uploads folder automatically if missing
//  * 2. Enables JSON / URL-encoded body parsing
//  * 3. Enables CORS
//  * 4. Serves uploaded files from /uploads
//  * 5. Serves React frontend build from /dist
//  * 6. Registers all backend API routes
//  * 7. Handles frontend React routes safely
//  * 8. Handles API 404 errors properly
//  * ============================================================================
//  */

// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// const fs = require("fs");

// // Route files
// const authRoutes = require("./routes/authRoutes");
// const ownerRoutes = require("./routes/ownerRoutes");

// const app = express();

// /* ============================================================================
//    1) IMPORTANT PATHS
// ============================================================================ */
// const uploadDir = path.join(__dirname, "../uploads");
// const distPath = path.join(__dirname, "../dist");
// const indexFilePath = path.join(distPath, "index.html");

// /* ============================================================================
//    2) CREATE UPLOADS FOLDER IF NOT EXISTS
// ============================================================================ */
// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir, { recursive: true });
//   console.log("✅ uploads folder created");
// }

// /* ============================================================================
//    3) GLOBAL MIDDLEWARE
// ============================================================================ */
// app.use(
//   cors({
//     origin: true,
//     credentials: true,
//   })
// );

// app.use(express.json({ limit: "50mb" }));
// app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// /* ============================================================================
//    4) STATIC FILES
// ============================================================================ */
// // Uploaded files access
// app.use("/uploads", express.static(uploadDir));

// // React build static files
// if (fs.existsSync(distPath)) {
//   app.use(express.static(distPath));
//   console.log("✅ React dist folder found and served");
// } else {
//   console.warn("⚠️ dist folder not found. Frontend static files will not be served.");
// }

// /* ============================================================================
//    5) HEALTH / TEST ROUTE
// ============================================================================ */
// app.get("/api/health", (req, res) => {
//   res.status(200).json({
//     success: true,
//     message: "Backend is running successfully",
//   });
// });

// /* ============================================================================
//    6) API ROUTES
// ============================================================================ */
// /**
//  * NOTE:
//  * You are currently using ownerRoutes for many modules.
//  * That is okay for now if your routes are defined inside ownerRoutes properly.
//  * Later, you can split them into separate files:
//  * - productRoutes
//  * - cartRoutes
//  * - categoryRoutes
//  * - orderRoutes
//  * - userRoutes
//  */

// app.use("/api/auth", authRoutes);
// app.use("/api/products", ownerRoutes);
// app.use("/api/cart", ownerRoutes);
// app.use("/api/categories", ownerRoutes);
// app.use("/api/orders", ownerRoutes);
// app.use("/api/v1/user", ownerRoutes);
// app.use("/api", ownerRoutes);

// /* ============================================================================
//    7) API 404 HANDLER
// ============================================================================ */
// /**
//  * If request starts with /api and no route matched,
//  * return JSON 404 instead of sending React index.html
//  */
// app.use("/api", (req, res) => {
//   return res.status(404).json({
//     success: false,
//     message: "API route not found",
//     path: req.originalUrl,
//   });
// });

// /* ============================================================================
//    8) FRONTEND CATCH-ALL ROUTE
// ============================================================================ */
// /**
//  * For React frontend routes like:
//  * /login
//  * /cart
//  * /product/123
//  * /checkout
//  *
//  * If React build exists, serve index.html.
//  * This avoids wildcard route parser issues from app.get("*", ...)
//  */
// app.use((req, res, next) => {
//   // If request is for a non-API route and React build exists, serve frontend
//   if (!req.originalUrl.startsWith("/api")) {
//     if (fs.existsSync(indexFilePath)) {
//       return res.sendFile(indexFilePath);
//     }

//     return res.status(404).json({
//       success: false,
//       message: "Frontend build not found (dist/index.html missing)",
//     });
//   }

//   next();
// });

// /* ============================================================================
//    9) FINAL ERROR HANDLER
// ============================================================================ */
// app.use((err, req, res, next) => {
//   console.error("❌ Express Error:", err);

//   res.status(err.status || 500).json({
//     success: false,
//     message: err.message || "Internal Server Error",
//   });
// });

// module.exports = app;































// local server to use ...

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// Routes
const authRoutes = require("./routes/authRoutes");
const ownerRoutes = require("./routes/ownerRoutes");

const app = express();

// Important Paths
const uploadDir = path.join(__dirname, "../uploads");
const distPath = path.join(__dirname, "../dist");
const indexFilePath = path.join(distPath, "index.html");

// Create uploads folder if it doesn't exist
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS Configuration
app.use(
    cors({
        origin: true,          // Allow requests from your PC and mobile during development
        credentials: true,
    })
);

// Static Files
app.use("/uploads", express.static(uploadDir));

// React build static files (for production deployment serving dist folder)
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    console.log("✅ React dist folder found and served");
}

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", ownerRoutes);
app.use("/api/cart", ownerRoutes);
app.use("/api/categories", ownerRoutes);
app.use("/api/orders", ownerRoutes);
app.use("/api/v1/user", ownerRoutes);
app.use("/api", ownerRoutes);

// Catch-all route to serve React's index.html for any frontend client routes
app.use((req, res, next) => {
    if (!req.originalUrl.startsWith("/api") && !req.originalUrl.startsWith("/uploads")) {
        if (fs.existsSync(indexFilePath)) {
            return res.sendFile(indexFilePath);
        }
    }
    next();
});

module.exports = app;