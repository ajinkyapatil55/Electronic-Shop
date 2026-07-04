/**
 * ============================================================================
 * server.js
 * ============================================================================
 * Purpose:
 * Starts the Express server for PM2 / production deployment.
 *
 * Features:
 * 1. Loads .env from project root
 * 2. Starts server on 0.0.0.0 for public access / PM2
 * 3. Handles uncaught errors safely
 * ============================================================================
 */

const path = require("path");

// Load environment variables from project root .env
require("dotenv").config({
  path: path.join(__dirname, "../.env"),
});

const app = require("./app");

const PORT = process.env.PORT || 8082;
const HOST = "0.0.0.0";

/* ============================================================================
   START SERVER
============================================================================ */
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server is running on http://${HOST}:${PORT}`);
});

/* ============================================================================
   HANDLE UNCAUGHT EXCEPTIONS
============================================================================ */
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

/* ============================================================================
   HANDLE UNHANDLED PROMISE REJECTIONS
============================================================================ */
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);

  server.close(() => {
    process.exit(1);
  });
});









//local server to use ...

// const path = require("path");
// require("dotenv").config({
//     path: path.join(__dirname, "../.env")
// });

// const express = require("express");
// const app = require("./app");

// const PORT = process.env.PORT || 8082;

// // Middleware
// app.use(express.json({ limit: "50mb" }));
// app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// // Listen on all network interfaces
// app.listen(PORT, "0.0.0.0", () => {
//     console.log(`Server running on port ${PORT}`);
// });