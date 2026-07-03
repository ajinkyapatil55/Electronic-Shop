/**
 * ============================================================================
 * authRoutes.js
 * ============================================================================
 * Purpose:
 * Handles user authentication routes
 * - Register
 * - Login
 * ============================================================================
 */

const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");

/* ============================================================================
   AUTH ROUTES
============================================================================ */

// Register new user
router.post("/register", authController.register);

// Login existing user
router.post("/login", authController.login);

module.exports = router;
















































// const express = require("express");
// const router = express.Router();

// const authController = require("../controllers/authController");

// // Register API
// router.post("/register", authController.register);

// // Login API
// router.post("/login", authController.login);

// module.exports = router;