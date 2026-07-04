const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const db = require("../config/db");

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "..", "..", "uploads");

/* ============================================================================
   STORE CONFIG (edit these as per your project)
============================================================================ */

const STORE = {
    name: "Electronic Shop",
    logoUrl: process.env.STORE_LOGO_URL || "", // e.g. https://yourdomain.com/logo.png
    supportEmail: process.env.SUPPORT_EMAIL || "support@electronicshop.com",
    supportPhone: process.env.SUPPORT_PHONE || "+91 9876543210",
    website: process.env.STORE_WEBSITE || "www.electronicshop.com",
    themeColor: "#2874F0",
};
/* ============================================================================
   SMTP TRANSPORTER
============================================================================ */

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// Debug check
// console.log("SMTP_HOST:", SMTP_HOST);
// console.log("SMTP_PORT:", SMTP_PORT);
// console.log("SMTP_USER:", SMTP_USER || "Missing");
// console.log("SMTP_PASS:", SMTP_PASS ? "Loaded" : "Missing");

// Validate env before creating transporter
if (!SMTP_USER || !SMTP_PASS) {
    console.error("❌ SMTP credentials are missing in .env");
}

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for 587
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false, // helps on some Windows/local setups
    },
});

/* ============================================================================
   VERIFY SMTP CONNECTION
============================================================================ */

async function verifySMTP() {
    try {
        await transporter.verify();
        console.log("✅ SMTP Server Connected Successfully");
    } catch (error) {
        console.error("❌ SMTP Connection Failed");
        console.error(error.message || error);
    }
}

verifySMTP();

/* ============================================================================
   FETCH ORDER DETAILS
   Uses your actual schema (products: id, name, price, image_url, category).
   No mrp column exists, so no "You Saved" line is shown — just price × qty.
============================================================================ */

async function getOrderDetailsWithUser(orderId) {

    const [orderRows] = await db.execute(
        `
    SELECT
      id,
      user_id,
      full_name,
      phone,
      email,
      address,
      city,
      pincode,
      total_amount,
      payment_method,
      coupon_code,
      created_at
    FROM orders
    WHERE id = ?
    `,
        [orderId]
    );

    if (!orderRows.length) {
        throw new Error(`Order #${orderId} not found`);
    }

    const order = orderRows[0];

    const [items] = await db.execute(
        `
    SELECT
      oi.product_id,
      oi.quantity,
      oi.price,
      p.name,
      p.image_url,
      p.category
    FROM order_items oi
    INNER JOIN products p
      ON p.id = oi.product_id
    WHERE oi.order_id = ?
    `,
        [orderId]
    );

    return {
        order,
        items,
    };
}

/* ============================================================================
   HELPERS
============================================================================ */

const inr = (num) => `₹${Number(num || 0).toLocaleString("en-IN")}`;

function firstImage(imageUrl) {
    if (!imageUrl) return "";
    try {
        if (imageUrl.startsWith("[")) {
            return JSON.parse(imageUrl)[0];
        }
        if (imageUrl.includes(",")) {
            return imageUrl.split(",")[0].trim();
        }
        return imageUrl;
    } catch {
        return imageUrl;
    }
}

// ============================================================================
// EMAIL CONTENT GENERATION
// ============================================================================
const PLACEHOLDER_IMG =
    "data:image/svg+xml;base64," +
    Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="90" height="90">
      <rect width="90" height="90" rx="8" fill="#f1f1f1"/>
      <text x="45" y="49" font-size="11" text-anchor="middle" fill="#9e9e9e" font-family="Arial">No Image</text>
    </svg>`
    ).toString("base64");

function prepareImageAttachments(items) {
    const attachments = [];
    const imageSrcByIndex = [];

    items.forEach((item, idx) => {
        const fileName = firstImage(item.image_url);

        if (!fileName) {
            imageSrcByIndex.push(PLACEHOLDER_IMG);
            return;
        }

        if (fileName.startsWith("http://") || fileName.startsWith("https://")) {
            imageSrcByIndex.push(fileName);
            return;
        }

        const filePath = path.join(UPLOADS_DIR, fileName);

        if (fs.existsSync(filePath)) {
            const cid = `product-img-${idx}-${Date.now()}@electronicshop`;
            attachments.push({
                filename: fileName,
                path: filePath,
                cid,
                contentDisposition: "inline", // prevents Gmail from also listing it as a downloadable attachment
            });
            imageSrcByIndex.push(`cid:${cid}`);
        } else {
            console.warn("⚠️ Product image not found on disk:", filePath);
            imageSrcByIndex.push(PLACEHOLDER_IMG);
        }
    });

    return { attachments, imageSrcByIndex };
}



function buildOrderEmailHtml({ order, items, imageSrcByIndex }) {

    // ---- Price breakdown calculations ----
    let itemsTotal = 0;

    items.forEach((item) => {
        const price = Number(item.price) || 0;
        const qty = Number(item.quantity) || 0;
        itemsTotal += price * qty;
    });

    // orders table has no discount_amount/shipping_charge columns,
    // so we derive discount as (itemsTotal - total_amount) when positive.
    const totalPaid = Number(order.total_amount) || 0;
    const couponDiscount = order.coupon_code && itemsTotal > totalPaid
        ? itemsTotal - totalPaid
        : 0;
    const shippingCharge = !order.coupon_code && totalPaid > itemsTotal
        ? totalPaid - itemsTotal
        : 0;

    // ---- Product cards ----
    const productRows = items.map((item, idx) => {
        const price = Number(item.price) || 0;
        const lineTotal = price * Number(item.quantity || 0);
        const imgSrc = imageSrcByIndex[idx] || PLACEHOLDER_IMG;

        return `
      <tr>
        <td style="padding:16px 10px;border-bottom:1px solid #eeeeee;" width="100">
          <img
            src="${imgSrc}"
            width="90"
            height="90"
            alt="${item.name}"
            style="object-fit:contain;border:1px solid #eeeeee;border-radius:8px;display:block;"
          />
        </td>

        <td style="padding:16px 10px;border-bottom:1px solid #eeeeee;" valign="top">
          <div style="font-size:15px;font-weight:600;color:#212121;margin-bottom:4px;">
            ${item.name}
          </div>
          ${item.category ? `<div style="font-size:12px;color:#878787;margin-bottom:6px;">${item.category}</div>` : ""}
          <div style="font-size:13px;color:#616161;">
            Qty: ${item.quantity}
          </div>
        </td>

        <td style="padding:16px 10px;border-bottom:1px solid #eeeeee;text-align:right;white-space:nowrap;" valign="top">
          <div style="font-size:15px;font-weight:700;color:#212121;">${inr(price)}</div>
          <div style="font-size:12px;color:#878787;margin-top:2px;">Total: ${inr(lineTotal)}</div>
        </td>
      </tr>
    `;
    }).join("");

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Order Confirmed</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:24px 0;">
    <tr>
      <td align="center">

        <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- LOGO / HEADER -->
          <tr>
            <td style="background:${STORE.themeColor};padding:20px;text-align:center;">
              ${STORE.logoUrl
                ? `<img src="${STORE.logoUrl}" alt="${STORE.name}" height="36" style="display:inline-block;" />`
                : `<span style="color:#ffffff;font-size:22px;font-weight:bold;">${STORE.name}</span>`
              }
            </td>
          </tr>

          <!-- SUCCESS BANNER -->
          <tr>
            <td style="padding:28px 24px 8px 24px;text-align:center;">
              <div style="font-size:40px;line-height:1;">✅</div>
              <div style="font-size:20px;font-weight:700;color:#212121;margin-top:8px;">Order Confirmed!</div>
              <div style="font-size:14px;color:#616161;margin-top:6px;">
                Thank you for shopping with ${STORE.name}.
              </div>
            </td>
          </tr>

          <!-- ORDER META -->
          <tr>
            <td style="padding:16px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:8px;">
                <tr>
                  <td style="padding:14px 18px;font-size:13px;color:#616161;">Order Number</td>
                  <td style="padding:14px 18px;font-size:13px;color:#212121;font-weight:600;text-align:right;">#${order.id}</td>
                </tr>
                <tr>
                  <td style="padding:0 18px 14px 18px;font-size:13px;color:#616161;">Order Date</td>
                  <td style="padding:0 18px 14px 18px;font-size:13px;color:#212121;font-weight:600;text-align:right;">
                    ${new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 18px 14px 18px;font-size:13px;color:#616161;">Payment Method</td>
                  <td style="padding:0 18px 14px 18px;font-size:13px;color:#212121;font-weight:600;text-align:right;">
                    ${order.payment_method.toUpperCase()}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- GREETING -->
          <tr>
            <td style="padding:8px 24px 0 24px;font-size:14px;color:#212121;">
              Hi <b>${order.full_name}</b>, we've received your order and are getting it ready.
            </td>
          </tr>

          <!-- PRODUCTS -->
          <tr>
            <td style="padding:20px 24px 0 24px;">
              <div style="font-size:13px;font-weight:700;color:#878787;letter-spacing:0.5px;border-bottom:2px solid #f0f0f0;padding-bottom:10px;">
                PRODUCTS YOU ORDERED
              </div>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${productRows}
              </table>
            </td>
          </tr>

          <!-- PRICE DETAILS -->
          <tr>
            <td style="padding:20px 24px 0 24px;">
              <div style="font-size:13px;font-weight:700;color:#878787;letter-spacing:0.5px;border-bottom:2px solid #f0f0f0;padding-bottom:10px;">
                PRICE DETAILS
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#212121;">
                <tr>
                  <td style="padding:10px 0;">Items Total</td>
                  <td style="padding:10px 0;text-align:right;">${inr(itemsTotal)}</td>
                </tr>
                ${couponDiscount > 0 ? `
                <tr>
                  <td style="padding:0 0 10px 0;color:#388e3c;">
                    Coupon Discount ${order.coupon_code ? `(${order.coupon_code})` : ""}
                  </td>
                  <td style="padding:0 0 10px 0;text-align:right;color:#388e3c;">-${inr(couponDiscount)}</td>
                </tr>` : ""}
                <tr>
                  <td style="padding:0 0 10px 0;">Shipping</td>
                  <td style="padding:0 0 10px 0;text-align:right;">
                    ${shippingCharge > 0 ? inr(shippingCharge) : `<span style="color:#388e3c;font-weight:600;">FREE</span>`}
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="border-top:1px solid #eeeeee;padding-top:10px;"></td>
                </tr>
                <tr>
                  <td style="padding:4px 0;font-size:16px;font-weight:700;">Total Paid</td>
                  <td style="padding:4px 0;text-align:right;font-size:16px;font-weight:700;">${inr(totalPaid)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- SHIPPING ADDRESS -->
          <tr>
            <td style="padding:20px 24px 0 24px;">
              <div style="font-size:13px;font-weight:700;color:#878787;letter-spacing:0.5px;border-bottom:2px solid #f0f0f0;padding-bottom:10px;">
                SHIPPING ADDRESS
              </div>
              <div style="font-size:14px;color:#212121;line-height:1.6;padding-top:10px;">
                <b>${order.full_name}</b><br>
                ${order.address}<br>
                ${order.city} - ${order.pincode}<br>
                Phone: ${order.phone}
              </div>
            </td>
          </tr>

          <!-- ESTIMATED DELIVERY -->
          <tr>
            <td style="padding:20px 24px 0 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border-radius:8px;">
                <tr>
                  <td style="padding:14px 18px;font-size:13px;color:#212121;">
                    📦 <b>Estimated Delivery:</b> 3–5 Business Days
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- SUPPORT -->
          <tr>
            <td style="padding:24px;text-align:center;">
              <div style="font-size:13px;color:#616161;">Need help with your order?</div>
              <div style="font-size:13px;color:#212121;margin-top:6px;">
                📧 <a href="mailto:${STORE.supportEmail}" style="color:${STORE.themeColor};text-decoration:none;">${STORE.supportEmail}</a>
                &nbsp;|&nbsp;
                📞 ${STORE.supportPhone}
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#fafafa;padding:18px 24px;text-align:center;border-top:1px solid #eeeeee;">
              <div style="font-size:14px;color:#212121;margin-bottom:4px;">Thank you for shopping with us ❤️</div>
              <div style="font-size:12px;color:#9e9e9e;">
                © ${new Date().getFullYear()} ${STORE.name} &nbsp;•&nbsp; ${STORE.website}
              </div>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
  `;
}

/* ============================================================================
   PLAIN TEXT VERSION
   Spam filters penalize HTML-only emails heavily. Providing a text
   alternative significantly improves inbox placement.
============================================================================ */

function buildOrderEmailText({ order, items }) {
    const lines = [];

    lines.push(`Order Confirmed - ${STORE.name}`);
    lines.push("");
    lines.push(`Hi ${order.full_name},`);
    lines.push(`Thank you for shopping with ${STORE.name}. Your order has been received.`);
    lines.push("");
    lines.push(`Order Number: #${order.id}`);
    lines.push(`Order Date  : ${new Date(order.created_at).toLocaleString("en-IN")}`);
    lines.push(`Payment     : ${order.payment_method.toUpperCase()}`);
    lines.push("");
    lines.push("Products Ordered:");

    items.forEach((item) => {
        const lineTotal = Number(item.price) * Number(item.quantity || 0);
        lines.push(`- ${item.name} | Qty: ${item.quantity} | ${inr(item.price)} each | Total: ${inr(lineTotal)}`);
    });

    lines.push("");
    lines.push(`Total Paid: ${inr(order.total_amount)}`);
    lines.push("");
    lines.push("Shipping Address:");
    lines.push(order.full_name);
    lines.push(order.address);
    lines.push(`${order.city} - ${order.pincode}`);
    lines.push(`Phone: ${order.phone}`);
    lines.push("");
    lines.push("Estimated Delivery: 3-5 Business Days");
    lines.push("");
    lines.push(`Need help? ${STORE.supportEmail} | ${STORE.supportPhone}`);
    lines.push("");
    lines.push(`Thank you for shopping with us - ${STORE.name}`);

    return lines.join("\n");
}

/* ============================================================================
   SEND ORDER EMAIL
============================================================================ */

async function sendOrderConfirmationEmail(orderId) {

    try {

        // console.log("================================================");
        // console.log("📧 Order Email Service Started");
        // console.log("Order ID :", orderId);

        const { order, items } = await getOrderDetailsWithUser(orderId);

        // console.log("Customer :", order.full_name);
        // console.log("Email    :", order.email);
        // console.log("Items    :", items.length);

        if (!order.email) {
            // console.log("Customer Email Missing.");
            return { sent: false };
        }

        const { attachments, imageSrcByIndex } = prepareImageAttachments(items);

        // console.log("Images embedded :", attachments.length, "/", items.length);

        const html = buildOrderEmailHtml({ order, items, imageSrcByIndex });
        const text = buildOrderEmailText({ order, items });

        console.log("HTML Generated Successfully");

        const info = await transporter.sendMail({
            from: `"${STORE.name}" <${process.env.SMTP_USER}>`,
            to: order.email,
            subject: `Order Confirmed - #${order.id} | ${STORE.name}`,
            text,
            html,
            attachments,
        });

        // console.log("======================================");
        // console.log("✅ Email Sent Successfully");
        // console.log("Message ID :", info.messageId);
        // console.log("Response   :", info.response);
        // console.log("======================================");

        return {
            sent: true,
            messageId: info.messageId,
        };

    } catch (error) {

       
        console.error("❌ EMAIL SEND FAILED");
        console.error(error);
    

        return {
            sent: false,
            error: error.message,
        };

    }

}

module.exports = {
    sendOrderConfirmationEmail,
};