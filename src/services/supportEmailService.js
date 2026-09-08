const nodemailer = require("nodemailer");
require("dotenv").config();

/* ============================================================================
   SUPPORT & STORE CONFIGURATION
============================================================================ */
const STORE = {
    name: "Electronic Shop",
    supportEmail: process.env.SUPPORT_EMAIL || process.env.SMTP_USER || "patilprem1501@gmail.com",
    supportPhone: process.env.SUPPORT_PHONE || "+91 9834350142",
    website: process.env.STORE_WEBSITE || "https://electronic-shop-lnk7.onrender.com/",
    themeColor: "#2563eb",
    darkColor: "#1e293b",
};

/* ============================================================================
   SMTP TRANSPORTER
============================================================================ */
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

if (!SMTP_USER || !SMTP_PASS) {
    console.error("❌ SMTP credentials missing in .env for Support Email Service");
}

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false,
    },
});

/* ============================================================================
   SEND SUPPORT TICKET EMAILS (CUSTOMER CONFIRMATION + ADMIN NOTIFICATION)
============================================================================ */
/**
 * Dispatches ticket acknowledgment to the customer and alert to admin
 * @param {Object} ticketData
 * @param {string} ticketData.ticketId
 * @param {string} ticketData.name
 * @param {string} ticketData.email
 * @param {string} ticketData.category
 * @param {string} ticketData.referenceId
 * @param {string} ticketData.message
 */
async function sendSupportTicketEmail({ ticketId, name, email, category, referenceId, message }) {
    if (!email || !name || !message) {
        throw new Error("Missing required fields: name, email, and message are required.");
    }

    const cleanRefId = referenceId && referenceId.trim() ? referenceId.trim() : "None Provided";
    const timestamp = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
    });

    // 1. Customer Acknowledgment Email
    const customerHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Support Ticket Created</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; padding: 28px 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
        .header p { margin: 6px 0 0 0; font-size: 14px; opacity: 0.9; }
        .content { padding: 28px 24px; }
        .badge-box { display: inline-block; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
        .ticket-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 18px 0; }
        .detail-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
        .detail-row:last-child { border-bottom: none; }
        .label { color: #64748b; font-weight: 500; }
        .value { color: #0f172a; font-weight: 600; }
        .message-box { background: #f1f5f9; border-left: 4px solid #2563eb; padding: 14px; border-radius: 4px; font-size: 14px; color: #334155; line-height: 1.6; margin-top: 14px; white-space: pre-wrap; }
        .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
        .footer a { color: #2563eb; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>${STORE.name} Customer Support</h1>
          <p>We have received your support request</p>
        </div>
        <div class="content">
          <div class="badge-box">Ticket #${ticketId}</div>
          <p style="font-size: 16px; margin-top: 0;">Dear <strong>${name}</strong>,</p>
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">
            Thank you for reaching out to <strong>${STORE.name}</strong>. Your ticket has been logged in our system. A dedicated support specialist is reviewing your inquiry and will follow up with you within <strong>24 business hours</strong>.
          </p>

          <div class="ticket-box">
            <div class="detail-row">
              <span class="label">Ticket Reference ID:</span>
              <span class="value" style="color: #2563eb;">${ticketId}</span>
            </div>
            <div class="detail-row">
              <span class="label">Category:</span>
              <span class="value">${category}</span>
            </div>
            <div class="detail-row">
              <span class="label">Order / Reference:</span>
              <span class="value">${cleanRefId}</span>
            </div>
            <div class="detail-row">
              <span class="label">Date & Time:</span>
              <span class="value">${timestamp}</span>
            </div>
            <div class="detail-row">
              <span class="label">Status:</span>
              <span class="value" style="color: #16a34a;">Under Review</span>
            </div>
          </div>

          <p style="font-size: 14px; font-weight: 600; margin-bottom: 6px; color: #1e293b;">Your Message:</p>
          <div class="message-box">${message}</div>

          <p style="font-size: 13px; color: #64748b; margin-top: 24px; line-height: 1.5;">
            Need to provide more information? You can reply directly to this email at any time, keeping the Ticket ID in the subject line.
          </p>
        </div>
        <div class="footer">
          <p style="margin: 0 0 6px 0;"><strong>${STORE.name} Support Team</strong></p>
          <p style="margin: 0 0 6px 0;">Helpline: ${STORE.supportPhone} | Email: ${STORE.supportEmail}</p>
          <p style="margin: 0;"><a href="${STORE.website}" target="_blank">Visit Store Website</a></p>
        </div>
      </div>
    </body>
    </html>
    `;

    // 2. Admin / Internal Notification Email
    const adminHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; padding: 20px; color: #0f172a; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #cbd5e1; padding: 24px; }
        .header { border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px; }
        .badge { background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .meta-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .meta-table td { padding: 8px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
        .meta-table td.key { color: #64748b; width: 35%; font-weight: 500; }
        .meta-table td.val { color: #0f172a; font-weight: 600; }
        .msg-container { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; font-size: 14px; white-space: pre-wrap; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <span class="badge">URGENT SUPPORT INQUIRY</span>
          <h2 style="margin: 10px 0 0 0; color: #0f172a; font-size: 20px;">[${ticketId}] New Ticket: ${category}</h2>
        </div>
        <table class="meta-table">
          <tr><td class="key">Ticket ID:</td><td class="val" style="color: #2563eb;">${ticketId}</td></tr>
          <tr><td class="key">Customer Name:</td><td class="val">${name}</td></tr>
          <tr><td class="key">Customer Email:</td><td class="val"><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td class="key">Category:</td><td class="val">${category}</td></tr>
          <tr><td class="key">Reference ID:</td><td class="val">${cleanRefId}</td></tr>
          <tr><td class="key">Received At:</td><td class="val">${timestamp}</td></tr>
        </table>
        <h4 style="margin: 16px 0 8px 0; color: #334155;">Customer Message:</h4>
        <div class="msg-container">${message}</div>
        <p style="margin-top: 20px; font-size: 12px; color: #64748b;">
          💡 Tip: You can reply directly to this notification to respond to <strong>${email}</strong>.
        </p>
      </div>
    </body>
    </html>
    `;

    const customerMailOptions = {
        from: `"${STORE.name} Support" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `[${ticketId}] Support Request Received - ${STORE.name}`,
        html: customerHtml,
    };

    const adminMailOptions = {
        from: `"${STORE.name} Desk" <${process.env.SMTP_USER}>`,
        to: STORE.supportEmail,
        replyTo: email,
        subject: `[${ticketId}] Support Ticket: ${category} - ${name}`,
        html: adminHtml,
    };

    const results = await Promise.allSettled([
        transporter.sendMail(customerMailOptions),
        transporter.sendMail(adminMailOptions),
    ]);

    const errors = results.filter((r) => r.status === "rejected").map((r) => r.reason?.message || r.reason);
    if (errors.length > 0) {
        console.warn("⚠️ Warning during support email dispatch:", errors);
    } else {
        console.log(`✅ Support emails dispatched successfully for Ticket: ${ticketId}`);
    }

    return {
        success: true,
        ticketId,
        customerEmailSent: results[0].status === "fulfilled",
        adminEmailSent: results[1].status === "fulfilled",
    };
}

module.exports = {
    sendSupportTicketEmail,
    transporter,
};
