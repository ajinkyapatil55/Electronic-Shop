const db = require("../config/db");
// 👉 CHANGE 1: import the new email service
const { sendOrderConfirmationEmail } = require("../services/orderEmailService");

// =========================================================================
// CREATE NEW SECURE ORDER PIPELINE (WITH STOCK MANAGEMENT + CART CLEANUP)
// =========================================================================
exports.createOrder = async (req, res) => {
  const { items, shippingDetails, payment } = req.body;

  // 1. Structural Validation Checks
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Checkout item manifest is empty or missing." });
  }

  if (!shippingDetails || !payment) {
    return res.status(400).json({ success: false, message: "Malformed transaction payload: Shipping or Payment details missing." });
  }

  // Validate critical delivery inputs
  const { fullName, phone, email, address, city, pincode } = shippingDetails;
  if (!fullName || !phone || !email || !address || !city || !pincode) {
    return res.status(400).json({ success: false, message: "All shipping address parameters are required." });
  }

  // Parse and validate numbers
  const u_id = parseInt(payment.userId, 10);
  const grossAmount = parseFloat(payment.grossAmount);

  if (isNaN(u_id) || isNaN(grossAmount)) {
    return res.status(400).json({ success: false, message: "Invalid user identity format or payment calculations." });
  }

  // Raw coupon code string from the client (may be null/empty if none applied)
  const rawCouponCode = payment.couponCode ? String(payment.couponCode).toUpperCase().trim() : null;

  // 2. Obtain Connection Pool Handle for ACID Database Transactions
  let connection;
  try {
    connection = await db.getConnection();
  } catch (connErr) {
    console.error("[DATABASE CONNECTION ERROR] Failed to connect to MySQL pool:", connErr);
    return res.status(500).json({ success: false, message: "Failed to establish database connection channel." });
  }

  try {
    // Start atomic transaction
    await connection.beginTransaction();

    // ===================================================================
    // STEP 0: SERVER-SIDE COUPON VALIDATION
    // ===================================================================
    let appliedCoupon = null; // will hold the validated coupon row, or stay null

    if (rawCouponCode) {
      // Lock the coupon row for this transaction (FOR UPDATE) so two
      // concurrent requests using the same coupon can't both pass the
      // usage_limit / already-used checks at the same time.
      const [couponRows] = await connection.execute(
        `SELECT * FROM coupons WHERE code = ? FOR UPDATE`,
        [rawCouponCode]
      );

      if (couponRows.length === 0) {
        throw new Error(`Coupon "${rawCouponCode}" does not exist.`);
      }

      const coupon = couponRows[0];

      // a) Must be active
      if (!coupon.active) {
        throw new Error(`Coupon "${rawCouponCode}" is not active.`);
      }

      // b) Must not be expired (and must have started already)
      const now = new Date();
      if (coupon.expiry_date && new Date(coupon.expiry_date) < now) {
        throw new Error(`Coupon "${rawCouponCode}" has expired.`);
      }
      if (coupon.start_date && new Date(coupon.start_date) > now) {
        throw new Error(`Coupon "${rawCouponCode}" is not active yet.`);
      }

      // c) Must be targeted at this user if it's a "particular" coupon
      if (coupon.target_type === 'particular' && Number(coupon.user_id) !== u_id) {
        throw new Error(`Coupon "${rawCouponCode}" is not valid for this account.`);
      }

      // d) Must not have hit its global usage_limit (if one is set)
      if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
        throw new Error(`Coupon "${rawCouponCode}" has reached its usage limit.`);
      }

      // e) This user must not have used this coupon before
      const [usageRows] = await connection.execute(
        `SELECT id FROM coupon_usage WHERE user_id = ? AND coupon_id = ?`,
        [u_id, coupon.id]
      );
      if (usageRows.length > 0) {
        throw new Error(`You have already used coupon "${rawCouponCode}". Each coupon can only be used once per account.`);
      }

      appliedCoupon = coupon;
    }

    // 3. Step A: Write core master order entry header record
    const insertOrderSql = `
      INSERT INTO orders (
        user_id,
        payment_method,
        full_name,
        phone,
        email,
        address,
        city,
        pincode,
        total_amount,
        coupon_code,
        status,
        payment_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')
    `;

    const [orderResult] = await connection.execute(insertOrderSql, [
      u_id,
      payment.method,
      fullName,
      phone,
      email,
      address,
      city,
      pincode,
      grossAmount,
      appliedCoupon ? appliedCoupon.code : null
    ]);

    const assignedOrderId = orderResult.insertId;

    // ===================================================================
    // STEP B: Loop & write individual product lines + STOCK MANAGEMENT
    // ===================================================================
    const insertItemsSql = `
      INSERT INTO order_items (order_id, product_id, quantity, price)
      VALUES (?, ?, ?, ?)
    `;

    for (const item of items) {
      const p_id = parseInt(item.id, 10);
      const price = parseFloat(item.price);
      const quantity = parseInt(item.quantity, 10) || 1;

      if (isNaN(p_id) || isNaN(price)) {
        throw new Error(`Malformed product properties layout encountered for item: ${item.name || p_id}`);
      }

      // Lock the product row for this transaction
      const [productRows] = await connection.execute(
        `SELECT id, name, stock FROM products WHERE id = ? FOR UPDATE`,
        [p_id]
      );

      if (productRows.length === 0) {
        throw new Error(`Product "${item.name || p_id}" no longer exists.`);
      }

      const product = productRows[0];

      if (product.stock < quantity) {
        throw new Error(
          product.stock === 0
            ? `"${product.name}" is now out of stock.`
            : `Insufficient stock for "${product.name}". Only ${product.stock} left.`
        );
      }

      // Decrement stock atomically inside this same transaction
      await connection.execute(
        `UPDATE products SET stock = stock - ? WHERE id = ?`,
        [quantity, p_id]
      );

      // Insert the order line item
      await connection.execute(insertItemsSql, [assignedOrderId, p_id, quantity, price]);
    }

    // 5. Step C: Handle specialized tracking references logs securely
    if (payment.method === 'gpay') {
      if (!payment.upiId) {
        throw new Error("UPI verification string handle expected.");
      }
      await connection.execute(
        'INSERT INTO payment_logs (order_id, method, tracking_reference) VALUES (?, ?, ?)',
        [assignedOrderId, 'gpay', payment.upiId]
      );
    } else if (payment.method === 'card') {
      if (!payment.cardNumber) {
        throw new Error("Credit card routing numbers expected.");
      }
      const obfuscatedCardNumber = `XXXX-XXXX-XXXX-${payment.cardNumber.slice(-4)}`;
      await connection.execute(
        'INSERT INTO payment_logs (order_id, method, tracking_reference) VALUES (?, ?, ?)',
        [assignedOrderId, 'card', obfuscatedCardNumber]
      );
    }

    // ===================================================================
    // STEP C.2: Coupon was validated above — now lock it for this user.
    // ===================================================================
    if (appliedCoupon) {
      await connection.execute(
        `UPDATE coupons SET used_count = used_count + 1 WHERE id = ?`,
        [appliedCoupon.id]
      );

      await connection.execute(
        `INSERT INTO coupon_usage (coupon_id, user_id, order_id) VALUES (?, ?, ?)`,
        [appliedCoupon.id, u_id, assignedOrderId]
      );
    }

    // 6. Step D: Clear user's shopping cart upon successful checkout loop completion
    const clearCartSql = `DELETE FROM cart WHERE user_id = ?`;
    await connection.execute(clearCartSql, [u_id]);

    // If everything passes cleanly, commit changes to database disk permanently
    await connection.commit();

    // 👉 CHANGE 2: fire the order-confirmation email AFTER commit.
    // Fire-and-forget (not awaited) so a slow mail server never delays
    // the checkout response the user is waiting for.
    console.log("Calling sendOrderConfirmationEmail...");

sendOrderConfirmationEmail(assignedOrderId)
  .then(() => {
    console.log("Email function completed.");
  })
  .catch(err => {
    console.error("EMAIL ERROR:");
    console.error(err);
  });

    return res.status(201).json({
      success: true,
      message: "Order successfully submitted and registered.",
      orderId: assignedOrderId
    });

  } catch (err) {
    console.error("[CRITICAL TRANSACTION ERROR] Pipeline aborted! Rolling back database...");
    console.error("SQL Trace Info:", err.message);

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("[DATABASE ROLLBACK ERROR] Rollback call failed:", rollbackErr);
      }
    }

    const lowerMsg = typeof err.message === 'string' ? err.message.toLowerCase() : '';
    const isClientError =
      lowerMsg.includes('coupon') ||
      lowerMsg.includes('stock') ||
      lowerMsg.includes('no longer exists');

    return res.status(isClientError ? 400 : 500).json({
      success: false,
      message: err.message || "Failed to process database checkout sequence."
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// =========================================================================
// GET ALL ORDERS (User overview helper) — unchanged, keep as-is
// =========================================================================
exports.getAllOrders = async (req, res) => {
  try {
    const query = `
      SELECT o.*, oi.id as item_id, oi.product_id, oi.quantity, oi.price as item_price, 
             pl.tracking_reference, p.name as product_name, p.image_url as product_image
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN payment_logs pl ON o.id = pl.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      ORDER BY o.id DESC
    `;
    const [rows] = await db.execute(query);

    const ordersMap = {};
    for (const row of rows) {
      if (!ordersMap[row.id]) {
        ordersMap[row.id] = {
          id: row.id,
          user_id: row.user_id,
          payment_method: row.payment_method,
          total_amount: row.total_amount,
          full_name: row.full_name,
          phone: row.phone,
          email: row.email,
          address: row.address,
          city: row.city,
          pincode: row.pincode,
          status: row.status,
          payment_status: row.payment_status,
          created_at: row.created_at,
          tracking_reference: row.tracking_reference,
          items: []
        };
      }
      if (row.item_id) {
        ordersMap[row.id].items.push({
          id: row.item_id,
          product_id: row.product_id,
          quantity: row.quantity,
          price: row.item_price,
          name: row.product_name,
          image_url: row.product_image
        });
      }
    }

    return res.status(200).json({
      success: true,
      orders: Object.values(ordersMap)
    });
  } catch (error) {
    console.error("[GET ALL ORDERS ERROR] Failed to fetch orders registry:", error);
    return res.status(500).json({ success: false, message: "Server error while retrieving orders registry." });
  }
};

// =========================================================================
// GET SPECIFIC SECURE LOGGED-IN USER ORDERS (SECURED) — unchanged
// =========================================================================
exports.getUserOrders = async (req, res) => {
  const authenticatedUserId = req.user?.id || req.user?.userId;

  if (!authenticatedUserId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Access denied. Valid identification parameters missing."
    });
  }

  try {
    const query = `
      SELECT o.*, oi.id as item_id, oi.product_id, oi.quantity, oi.price as item_price, 
             pl.tracking_reference, p.name as product_name, p.image_url as product_image
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN payment_logs pl ON o.id = pl.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE o.user_id = ?
      ORDER BY o.id DESC
    `;

    const [rows] = await db.execute(query, [authenticatedUserId]);

    const ordersMap = {};
    for (const row of rows) {
      if (!ordersMap[row.id]) {
        ordersMap[row.id] = {
          id: row.id,
          user_id: row.user_id,
          payment_method: row.payment_method,
          total_amount: row.total_amount,
          full_name: row.full_name,
          phone: row.phone,
          email: row.email,
          address: row.address,
          city: row.city,
          pincode: row.pincode,
          status: row.status,
          payment_status: row.payment_status,
          created_at: row.created_at,
          tracking_reference: row.tracking_reference,
          items: []
        };
      }

      if (row.item_id) {
        ordersMap[row.id].items.push({
          id: row.item_id,
          product_id: row.product_id,
          quantity: row.quantity,
          price: row.item_price,
          name: row.product_name,
          image_url: row.product_image
        });
      }
    }

    return res.status(200).json({
      success: true,
      orders: Object.values(ordersMap)
    });

  } catch (error) {
    console.error(`[GET USER ORDERS ERROR] Failed to retrieve orders for user ID: ${authenticatedUserId}:`, error);
    return res.status(500).json({
      success: false,
      message: "Server error while retrieving your past transactions."
    });
  }
};

// =========================================================================
// GET ALL ORDERS (Admin overview) — unchanged
// =========================================================================
// exports.getAllOrdersAdmin = async (req, res) => {
//   try {
//     const query = `
//       SELECT o.*, oi.id as item_id, oi.product_id, oi.quantity, oi.price as item_price, 
//              pl.tracking_reference, p.name as product_name, p.image_url as product_image
//       FROM orders o
//       LEFT JOIN order_items oi ON o.id = oi.order_id
//       LEFT JOIN payment_logs pl ON o.id = pl.order_id
//       LEFT JOIN products p ON oi.product_id = p.id
//       ORDER BY o.id DESC
//     `;
//     const [rows] = await db.execute(query);

//     const ordersMap = {};

//     for (const row of rows) {
//       if (!ordersMap[row.id]) {
//         ordersMap[row.id] = {
//           id: row.id,
//           user_id: row.user_id,
//           payment_method: row.payment_method,
//           total_amount: row.total_amount,
//           full_name: row.full_name,
//           phone: row.phone,
//           email: row.email,
//           address: row.address,
//           city: row.city,
//           pincode: row.pincode,
//           status: row.status,
//           payment_status: row.payment_status,
//           created_at: row.created_at,
//           tracking_reference: row.tracking_reference,
//           items: []
//         };
//       }

//       if (row.item_id) {
//         ordersMap[row.id].items.push({
//           id: row.item_id,
//           product_id: row.product_id,
//           quantity: row.quantity,
//           price: row.item_price,
//           name: row.product_name,
//           image_url: row.product_image
//         });
//       }
//     }

//     return res.status(200).json({
//       success: true,
//       orders: Object.values(ordersMap)
//     });
//   } catch (error) {
//     console.error("[ADMIN ORDERS DATA ERROR] Failed to fetch system orders registry:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server error while retrieving structural records for orders registry."
//     });
//   }
// };


exports.getAllOrdersAdmin = async (req, res) => {
  try {
    const query = `
      SELECT o.*, oi.id as item_id, oi.product_id, oi.quantity, oi.price as item_price, 
             pl.tracking_reference, p.name as product_name, p.image_url as product_image
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN payment_logs pl ON o.id = pl.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      ORDER BY o.id DESC
    `;
    const [rows] = await db.execute(query);

    const ordersMap = {};

    for (const row of rows) {
      if (!ordersMap[row.id]) {
        ordersMap[row.id] = {
          id: row.id,
          user_id: row.user_id,
          payment_method: row.payment_method,
          total_amount: row.total_amount,
          full_name: row.full_name,
          phone: row.phone,
          email: row.email,
          address: row.address,
          city: row.city,
          pincode: row.pincode,
          status: row.status,
          payment_status: row.payment_status,
          created_at: row.created_at,
          tracking_reference: row.tracking_reference,
          items: []
        };
      }

      if (row.item_id) {
        // --- IMAGE PARSING LOGIC FOR MULTIPLE IMAGES ---
        let processedImage = "default-placeholder.png";

        if (row.product_image) {
          const trimmedImg = row.product_image.trim();
          // Check if it's formatted as a JSON array string
          if (trimmedImg.startsWith("[") && trimmedImg.endsWith("]")) {
            try {
              const parsedImages = JSON.parse(trimmedImg);
              if (Array.isArray(parsedImages) && parsedImages.length > 0) {
                // Safely extract the very first item from the array string
                processedImage = parsedImages[0];
              }
            } catch (e) {
              // If JSON parsing fails, fall back to using the raw string value
              processedImage = row.product_image;
            }
          } else {
            processedImage = row.product_image;
          }
        }

        ordersMap[row.id].items.push({
          id: row.item_id,
          product_id: row.product_id,
          quantity: row.quantity,
          price: row.item_price,
          name: row.product_name,
          product_image: processedImage // Send out just a clean single image filename
        });
      }
    }

    return res.status(200).json({
      success: true,
      orders: Object.values(ordersMap)
    });
  } catch (error) {
    console.error("[ADMIN ORDERS DATA ERROR] Failed to fetch system orders registry:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while retrieving structural records for orders registry."
    });
  }
};




// =========================================================================
// UPDATE EXISTING ORDER STATUS PROGRESSION (Admin operation) — unchanged
// =========================================================================
exports.updateOrderStatusAdmin = async (req, res) => {
  const { orderId, status } = req.body;

  if (!orderId || !status) {
    return res.status(400).json({
      success: false,
      message: "Required parameters (orderId, status) are missing from request payload."
    });
  }

  const parsedOrderId = parseInt(orderId, 10);
  if (isNaN(parsedOrderId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid format provided for order identity."
    });
  }

  let dbStatusValue = status.toLowerCase().trim();

  if (dbStatusValue.includes("pending")) dbStatusValue = "pending";
  else if (dbStatusValue.includes("processing")) dbStatusValue = "processing";
  else if (dbStatusValue.includes("shipped")) dbStatusValue = "shipped";
  else if (dbStatusValue.includes("cancelled")) dbStatusValue = "cancelled";

  // Delivered is controlled exclusively by the customer-email OTP verification flow.
  const absoluteStatuses = ["pending", "processing", "shipped", "cancelled"];
  if (!absoluteStatuses.includes(dbStatusValue)) {
    return res.status(400).json({
      success: false,
      message: status.toLowerCase().includes("delivered")
        ? "Delivered status can only be set after successful delivery OTP verification."
        : `Invalid status string configuration target value parsed: ${status}`
    });
  }

  try {
    const updateSql = "UPDATE `orders` SET `status` = ?, `updated_at` = NOW() WHERE `id` = ?";
    const [result] = await db.execute(updateSql, [dbStatusValue, parsedOrderId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: `No active order record found matching identifier: #${parsedOrderId}`
      });
    }

    return res.status(200).json({
      success: true,
      message: `Order status tracking altered successfully.`,
      updatedOrderId: parsedOrderId,
      newStatus: dbStatusValue
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Database error: ${error.message}`
    });
  }
};


// =========================================================================
// DELETE / CANCEL ORDER (User-initiated) — new feature
// =========================================================================
exports.cancelOrder = async (req, res) => {
  const { orderId } = req.params;
  
  // Extract user ID mapped from your Authentication Middleware (JWT decoder)
  const authenticatedUserId = req.user?.id || req.user?.userId || req.user?.user_id;

  // 1. Validation Checks
  if (!orderId || isNaN(parseInt(orderId, 10))) {
    return res.status(400).json({ 
      success: false, 
      message: "A valid numeric order ID parameter is required." 
    });
  }

  if (!authenticatedUserId) {
    return res.status(401).json({ 
      success: false, 
      message: "Unauthorized: Access denied due to missing or invalid token credentials." 
    });
  }

  let connection;
  try {
    // Acquire a dedicated client connection out of the pool to ensure safe transaction isolation
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 2. Fetch order metadata & apply a Row-Level Lock (FOR UPDATE) to prevent concurrency race conditions
    const [orderRows] = await connection.execute(
      `SELECT id, user_id, status, coupon_code FROM orders WHERE id = ? FOR UPDATE`,
      [orderId]
    );

    if (orderRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Target transaction matching identifier could not be resolved in our records." 
      });
    }

    const order = orderRows[0];

    // 3. Security Check: Block users attempting to delete someone else's order record
    if (Number(order.user_id) !== Number(authenticatedUserId)) {
      return res.status(403).json({ 
        success: false, 
        message: "Access Denied: You do not have permission to modify orders belonging to another account." 
      });
    }

    // 4. Status Check: Only 'pending' or 'processing' statuses can be canceled/deleted
    const currentStatus = (order.status || '').toLowerCase().trim();
    if (currentStatus !== 'pending' && currentStatus !== 'processing') {
      return res.status(400).json({ 
        success: false, 
        message: `Order cannot be canceled because it has already transitioned into a mutable stage (${order.status}).` 
      });
    }

    // 5. Inventory Restoration: Fetch items inside this order and add the quantities back to stock tables
    const [items] = await connection.execute(
      `SELECT product_id, quantity FROM order_items WHERE order_id = ?`,
      [orderId]
    );

    for (const item of items) {
      await connection.execute(
        `UPDATE products SET stock = stock + ? WHERE id = ?`,
        [item.quantity, item.product_id]
      );
    }

    // 6. Coupon Metric Rollbacks (If a coupon was applied to the order)
    if (order.coupon_code) {
      const [couponRows] = await connection.execute(
        `SELECT id FROM coupons WHERE code = ?`,
        [order.coupon_code]
      );

      if (couponRows.length > 0) {
        const couponId = couponRows[0].id;
        
        // Lower usage counter securely without dropping under 0 boundaries
        await connection.execute(
          `UPDATE coupons SET used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END WHERE id = ?`,
          [couponId]
        );

        // Wipe out tracking history configuration mapping links
        await connection.execute(
          `DELETE FROM coupon_usage WHERE coupon_id = ? AND user_id = ? AND order_id = ?`,
          [couponId, authenticatedUserId, orderId]
        );
      }
    }

    // 7. Cascade Deletions across dependent tables
    await connection.execute(`DELETE FROM payment_logs WHERE order_id = ?`, [orderId]);
    await connection.execute(`DELETE FROM order_items WHERE order_id = ?`, [orderId]);
    
    // Final step: Remove the master row tracking entry itself
    const [deleteResult] = await connection.execute(`DELETE FROM orders WHERE id = ?`, [orderId]);

    if (deleteResult.affectedRows === 0) {
      throw new Error("Core database master tracking deletion returned an empty response set execution matrix.");
    }

    // Everything executed flawlessly -> Save permanently to database disk memory
    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Order was successfully cancelled, product stock restored, and data records deleted safely.",
      cancelledOrderId: parseInt(orderId, 10)
    });

  } catch (err) {
    console.error("[CRITICAL TRANS ACTION CANCELATION ERROR]: Instigating emergency database rollback...", err);
    
    if (connection) {
      try { 
        await connection.rollback(); 
      } catch (rollbackErr) { 
        console.error("Failed to execute database rollback protocol context:", rollbackErr); 
      }
    }

    return res.status(500).json({ 
      success: false, 
      message: err.message || "Internal server error occurred processing target secure removal pipeline lifecycle." 
    });
  } finally {
    if (connection) connection.release(); // Free connection handle back to pool
  }
};


// =========================================================================
// GET ORDER FROM ONLY STATUS ARE 'SHIPPED' THIS ONLY FETCH TO THE DELIVERY BOY
// =========================================================================
// exports.getShippedOrdersForDelivery = async (req, res) => {
//   try {
//     const query = `
//       SELECT o.*, oi.id as item_id, oi.product_id, oi.quantity, oi.price as item_price, 
//              pl.tracking_reference, p.name as product_name, p.image_url as product_image
//       FROM orders o
//       LEFT JOIN order_items oi ON o.id = oi.order_id
//       LEFT JOIN payment_logs pl ON o.id = pl.order_id
//       LEFT JOIN products p ON oi.product_id = p.id
//       WHERE o.status = 'SHIPPED'
//       ORDER BY o.id DESC
//     `;
//     const [rows] = await db.execute(query);

//     const ordersMap = {};

//     for (const row of rows) {
//       if (!ordersMap[row.id]) {
//         ordersMap[row.id] = {
//           id: row.id,
//           user_id: row.user_id,
//           payment_method: row.payment_method,
//           total_amount: row.total_amount,
//           full_name: row.full_name,
//           phone: row.phone,
//           email: row.email,
//           address: row.address,
//           city: row.city,
//           pincode: row.pincode,
//           status: row.status,
//           payment_status: row.payment_status,
//           created_at: row.created_at,
//           tracking_reference: row.tracking_reference,
//           items: []
//         };
//       }

//       if (row.item_id) {
//         ordersMap[row.id].items.push({
//           id: row.item_id,
//           product_id: row.product_id,
//           quantity: row.quantity,
//           price: row.item_price,
//           name: row.product_name,
//           image_url: row.product_image
//         });
//       }
//     }

//     return res.status(200).json({
//       success: true,
//       orders: Object.values(ordersMap)
//     });
//   } catch (error) {
//     console.error("[ADMIN ORDERS DATA ERROR] Failed to fetch system orders registry:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Server error while retrieving structural records for orders registry."
//     });
//   }
// };


exports.getShippedOrdersForDelivery = async (req, res) => {
  try {
    // Include unassigned shipped orders and orders whose latest delivery assignment was rejected.
    const query = `
      SELECT o.*, oi.id as item_id, oi.product_id, oi.quantity, oi.price as item_price, 
             pl.tracking_reference, p.name as product_name, p.image_url as product_image
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN payment_logs pl ON o.id = pl.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN (
        SELECT ad1.* FROM assign_delivery ad1
        INNER JOIN (
          SELECT order_id, MAX(id) as max_id 
          FROM assign_delivery 
          GROUP BY order_id
        ) ad2 ON ad1.id = ad2.max_id
      ) ad ON o.id = ad.order_id
      WHERE (
        (LOWER(o.status) = 'shipped' AND ad.order_id IS NULL)
        OR ad.assignment_status = 'rejected'
      )
      ORDER BY o.id DESC
    `;
    const [rows] = await db.execute(query);

    const ordersMap = {};

    for (const row of rows) {
      if (!ordersMap[row.id]) {
        ordersMap[row.id] = {
          id: row.id,
          user_id: row.user_id,
          payment_method: row.payment_method,
          full_name: row.full_name,
          phone: row.phone,
          email: row.email,
          address: row.address,
          city: row.city,
          pincode: row.pincode,
          total_amount: row.total_amount,
          offer_amount: row.offer_amount,          
          delivery_charges: row.delivery_charges,  
          status: row.status,
          payment_status: row.payment_status,      
          created_at: row.created_at,
          tracking_reference: row.tracking_reference,
          items: []
        };
      }

      if (row.item_id) {
        let processedImage = "default-placeholder.png";

        if (row.product_image) {
          const trimmedImg = row.product_image.trim();
          if (trimmedImg.startsWith("[") && trimmedImg.endsWith("]")) {
            try {
              const parsedImages = JSON.parse(trimmedImg);
              if (Array.isArray(parsedImages) && parsedImages.length > 0) {
                processedImage = parsedImages[0];
              }
            } catch (e) {
              processedImage = row.product_image;
            }
          } else {
            processedImage = row.product_image;
          }
        }

        ordersMap[row.id].items.push({
          id: row.item_id,
          product_id: row.product_id,
          quantity: row.quantity,
          price: row.item_price,
          name: row.product_name,
          product_image: processedImage
        });
      }
    }

    return res.status(200).json({
      success: true,
      orders: Object.values(ordersMap)
    });
  } catch (error) {
    console.error("[ADMIN SHIPPED ORDERS DATA ERROR] Failed to fetch system records:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while retrieving structural records for shipped orders."
    });
  }
};
