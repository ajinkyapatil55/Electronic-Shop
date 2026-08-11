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
const path = require("path");
const fs = require("fs");

const authController = require("../controllers/authController");
const auth = require("../middleware/authMiddleware");
const deliveryboyinfoController = require("../controllers/deliveryboyinfoController");
const upload = require("../config/multer");

const uploadFields = upload.fields([
  { name: "profile_photo", maxCount: 1 },
  { name: "aadhaar_photo", maxCount: 1 },
  { name: "pan_photo", maxCount: 1 },
  { name: "driving_license_photo", maxCount: 1 },
  { name: "vehicle_rc_photo", maxCount: 1 }
]);

/* ============================================================================
   AUTH ROUTES
============================================================================ */

// Register new user
router.post("/register", authController.register);

// Login existing user
router.post("/login", authController.login);

// Delivery Boy Profile
router.get("/rest_api_get_delivery_boy_profile", auth, deliveryboyinfoController.getDeliveryBoyProfile);
router.post("/rest_api_save_delivery_boy_details", auth, uploadFields, deliveryboyinfoController.saveDeliveryBoyProfileDetails);
router.post("/rest_api_register_delivery_boy", uploadFields, deliveryboyinfoController.registerDeliveryBoy);
router.post("/rest_api_update_delivery_boy_status", auth, deliveryboyinfoController.updateDeliveryBoyStatus);

module.exports = router;
















































// const express = require("express");
// const router = express.Router();

// const authController = require("../controllers/authController");

// // Register API
// router.post("/register", authController.register);

// // Login API
// router.post("/login", authController.login);

// module.exports = router;