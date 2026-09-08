const db = require("../config/db");
const { sendSupportTicketEmail } = require("../services/supportEmailService");

// Auto-initialize support_tickets table if not present
let tableChecked = false;
async function ensureTable() {
    if (tableChecked) return;
    try {
        const query = `
            CREATE TABLE IF NOT EXISTS support_tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ticket_id VARCHAR(50) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                category VARCHAR(100) DEFAULT 'General Inquiry',
                reference_id VARCHAR(100) DEFAULT NULL,
                message TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'OPEN',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;
        await db.query(query);
        tableChecked = true;
    } catch (err) {
        console.error("⚠️ Failed to ensure support_tickets table:", err.message);
    }
}

/**
 * Handle new support ticket submission
 * Route: POST /api/support/ticket
 */
async function createSupportTicket(req, res) {
    try {
        const { name, email, category, referenceId, message } = req.body;

        // Validation
        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Your name is required.",
            });
        }

        if (!email || typeof email !== "string" || !email.trim()) {
            return res.status(400).json({
                success: false,
                message: "A valid email address is required.",
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address.",
            });
        }

        if (!message || typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please enter your message or question.",
            });
        }

        // Generate unique ticket reference ID
        const ticketId = `TKT-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
        const cleanCategory = category ? category.trim() : "General Inquiry";
        const cleanRefId = referenceId ? referenceId.trim() : null;
        const cleanName = name.trim();
        const cleanEmail = email.trim();
        const cleanMessage = message.trim();

        // 1. Ensure Table and Record in Database
        await ensureTable();
        try {
            const insertQuery = `
                INSERT INTO support_tickets (ticket_id, name, email, category, reference_id, message)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            await db.query(insertQuery, [
                ticketId,
                cleanName,
                cleanEmail,
                cleanCategory,
                cleanRefId,
                cleanMessage,
            ]);
        } catch (dbErr) {
            console.error("⚠️ Warning: Could not log ticket to database:", dbErr.message);
            // Non-fatal, continue with email dispatch
        }

        // 2. Dispatch Emails via dedicated SMTP Support Email Service
        let emailResult = { success: false };
        try {
            emailResult = await sendSupportTicketEmail({
                ticketId,
                name: cleanName,
                email: cleanEmail,
                category: cleanCategory,
                referenceId: cleanRefId,
                message: cleanMessage,
            });
        } catch (emailErr) {
            console.error("❌ Email dispatch failed:", emailErr.message);
        }

        return res.status(200).json({
            success: true,
            ticketId,
            message: "Support ticket received successfully. A confirmation email has been dispatched.",
            emailSent: emailResult.success || false,
        });
    } catch (error) {
        console.error("❌ Error in createSupportTicket:", error);
        return res.status(500).json({
            success: false,
            message: "An internal server error occurred while processing your support ticket.",
            error: error.message,
        });
    }
}

module.exports = {
    createSupportTicket,
};
