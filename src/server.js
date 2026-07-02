// //live server to use PM2... 

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = require("./app");

const PORT = process.env.PORT || 8082;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
});















// //local server to use ...

// require("dotenv").config();

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