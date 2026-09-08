const express = require("express");
const router = express.Router();
const supportController = require("../controllers/supportController");

// POST /api/support/ticket
router.post("/ticket", supportController.createSupportTicket);

module.exports = router;
