// controllers/deliveryboyinfoController.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require("../config/db");
const notificationService = require('../services/notificationService');
const { sendDeliveryCompletionOtpEmail } = require("../services/orderEmailService");

let deliveryOtpTablePromise;

function ensureDeliveryOtpTable() {
    if (!deliveryOtpTablePromise) {
        deliveryOtpTablePromise = db.execute(`
            CREATE TABLE IF NOT EXISTS delivery_completion_otps (
                order_id BIGINT NOT NULL PRIMARY KEY,
                code_hash CHAR(64) NOT NULL,
                expires_at DATETIME NOT NULL,
                attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
    }
    return deliveryOtpTablePromise;
}

function getAuthenticatedUserId(req) {
    return req.user?.id || req.user?._id || req.user?.userId || req.user?.user_id;
}

// ================== 1. Get Delivery Boy Profile ==================
// 1. Fetch Profile Data for the Currently Logged-in Delivery Boy
// =================================================================
exports.getDeliveryBoyProfile = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id || req.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'You must be logged in to view this profile.'
            });
        }

        const [userRows] = await db.query(
            'SELECT id, name, email, role FROM users WHERE id = ?',
            [userId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ success: false, message: 'User account not found.' });
        }

        const user = userRows[0];

        let delivery_boy_details = null;
        try {
            const [deliveryBoyRows] = await db.query(
                `SELECT mobile, alternate_mobile, address, city, state, pincode, dob, gender,
                        aadhaar_number, pan_number, driving_license_number,
                        vehicle_type, vehicle_number, joining_date,
                        emergency_contact_name, emergency_contact_mobile,
                        profile_photo, aadhaar_photo, pan_photo, driving_license_photo, vehicle_rc_photo, status
                 FROM delivery_boys
                 WHERE user_id = ?`,
                [userId]
            );

            if (deliveryBoyRows.length > 0) {
                delivery_boy_details = deliveryBoyRows[0];
            }
        } catch (dbError) {
            console.error('⚠️ Column mismatch or missing table in delivery_boys:', dbError.message);
        }

        return res.status(200).json({
            success: true,
            data: {
                user,
                delivery_boy_details
            }
        });

    } catch (err) {
        console.error('❌ getDeliveryBoyProfile error:', err);
        return res.status(500).json({
            success: false,
            message: 'Something went wrong loading the profile.',
            errorDetail: err.message
        });
    }
};

// 2. Save or Update Delivery Boy Profile Details (Secure Route)
exports.saveDeliveryBoyProfileDetails = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'You must be logged in to save this profile.' });
        }

        const {
            mobile, alternate_mobile, address, city, state, pincode, dob, gender,
            aadhaar_number, pan_number, driving_license_number,
            vehicle_type, vehicle_number, joining_date,
            emergency_contact_name, emergency_contact_mobile
        } = req.body;

        const profile_photo = req.files?.['profile_photo'] ? `uploads/${req.files['profile_photo'][0].filename}` : req.body.profile_photo;
        const aadhaar_photo = req.files?.['aadhaar_photo'] ? `uploads/${req.files['aadhaar_photo'][0].filename}` : req.body.aadhaar_photo;
        const pan_photo = req.files?.['pan_photo'] ? `uploads/${req.files['pan_photo'][0].filename}` : req.body.pan_photo;
        const driving_license_photo = req.files?.['driving_license_photo'] ? `uploads/${req.files['driving_license_photo'][0].filename}` : req.body.driving_license_photo;
        const vehicle_rc_photo = req.files?.['vehicle_rc_photo'] ? `uploads/${req.files['vehicle_rc_photo'][0].filename}` : req.body.vehicle_rc_photo;

        // Validation for mandatory fields required by schema definitions
        if (!mobile || !address || !city || !state || !pincode) {
            return res.status(400).json({ success: false, message: 'Mobile, address, city, state and pincode are required elements' });
        }
        if (!aadhaar_number || !driving_license_number || !vehicle_type || !vehicle_number || !joining_date) {
            return res.status(400).json({ success: false, message: 'Aadhaar, license details, vehicle verification parameters and date signatures are required' });
        }

        // Run verification lookup query checking for an existing profile record
        const [existingEntry] = await db.query('SELECT id FROM delivery_boys WHERE user_id = ?', [userId]);

        if (existingEntry.length > 0) {
            // Update an established profile dataset map row
            await db.query(
                `UPDATE delivery_boys
                 SET mobile = ?, alternate_mobile = ?, address = ?, city = ?, state = ?, pincode = ?,
                     dob = ?, gender = ?, aadhaar_number = ?, pan_number = ?, driving_license_number = ?,
                     vehicle_type = ?, vehicle_number = ?, joining_date = ?,
                     emergency_contact_name = ?, emergency_contact_mobile = ?,
                     profile_photo = ?, aadhaar_photo = ?, pan_photo = ?,
                     driving_license_photo = ?, vehicle_rc_photo = ?
                 WHERE user_id = ?`,
                [
                    mobile, alternate_mobile || null, address, city, state, pincode,
                    dob || null, gender || 'Male', aadhaar_number, pan_number || null, driving_license_number,
                    vehicle_type, vehicle_number, joining_date,
                    emergency_contact_name || null, emergency_contact_mobile || null,
                    profile_photo || null, aadhaar_photo || null, pan_photo || null,
                    driving_license_photo || null, vehicle_rc_photo || null,
                    userId
                ]
            );
        } else {
            // Instantiate completely fresh structural row registration transaction tracking parameters
            await db.query(
                `INSERT INTO delivery_boys (
                     user_id, mobile, alternate_mobile, address, city, state, pincode, dob, gender,
                     aadhaar_number, pan_number, driving_license_number,
                     vehicle_type, vehicle_number, joining_date,
                     emergency_contact_name, emergency_contact_mobile,
                     profile_photo, aadhaar_photo, pan_photo, driving_license_photo, vehicle_rc_photo,
                     status
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Inactive')`,
                [
                    userId, mobile, alternate_mobile || null, address, city, state, pincode,
                    dob || null, gender || 'Male', aadhaar_number, pan_number || null, driving_license_number,
                    vehicle_type, vehicle_number, joining_date,
                    emergency_contact_name || null, emergency_contact_mobile || null,
                    profile_photo || null, aadhaar_photo || null, pan_photo || null,
                    driving_license_photo || null, vehicle_rc_photo || null
                ]
            );
        }

        return res.status(200).json({ success: true, message: 'Logistics data matrix compiled and saved successfully!' });

    } catch (err) {
        console.error('Save configuration profiles error execution pipeline:', err);
        return res.status(500).json({ success: false, message: 'Database state verification failure during profile synchronization mapping' });
    }
};

// =========================================================================
// 3. Register Delivery Boy (Legacy Creation Route / Admin Panel context)
//
exports.registerDeliveryBoy = async (req, res) => {
    const {
        name, email, password, confirmPassword,
        mobile, alternate_mobile, address, city, state, pincode, dob, gender,
        aadhaar_number, pan_number, driving_license_number,
        vehicle_type, vehicle_number, joining_date,
        emergency_contact_name, emergency_contact_mobile
    } = req.body;

    const profile_photo = req.files?.['profile_photo'] ? `uploads/${req.files['profile_photo'][0].filename}` : req.body.profile_photo;
    const aadhaar_photo = req.files?.['aadhaar_photo'] ? `uploads/${req.files['aadhaar_photo'][0].filename}` : req.body.aadhaar_photo;
    const pan_photo = req.files?.['pan_photo'] ? `uploads/${req.files['pan_photo'][0].filename}` : req.body.pan_photo;
    const driving_license_photo = req.files?.['driving_license_photo'] ? `uploads/${req.files['driving_license_photo'][0].filename}` : req.body.driving_license_photo;
    const vehicle_rc_photo = req.files?.['vehicle_rc_photo'] ? `uploads/${req.files['vehicle_rc_photo'][0].filename}` : req.body.vehicle_rc_photo;

    if (!name || !email || !password || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    }
    if (password !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    if (!mobile || !address || !city || !state || !pincode) {
        return res.status(400).json({ success: false, message: 'Mobile, address, city, state and pincode are required' });
    }
    if (!aadhaar_number || !driving_license_number || !vehicle_type || !vehicle_number || !joining_date) {
        return res.status(400).json({ success: false, message: 'Aadhaar, driving license, vehicle type/number and joining date are required' });
    }

    try {
        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const [userResult] = await db.query(
            `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'delivery_boy')`,
            [name, email, hashedPassword]
        );
        const userId = userResult.insertId;

        await db.query(
            `INSERT INTO delivery_boys (
                 user_id, mobile, alternate_mobile, address, city, state, pincode, dob, gender,
                 aadhaar_number, pan_number, driving_license_number,
                 vehicle_type, vehicle_number, joining_date,
                 emergency_contact_name, emergency_contact_mobile,
                 profile_photo, aadhaar_photo, pan_photo, driving_license_photo, vehicle_rc_photo
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId, mobile, alternate_mobile || null, address, city, state, pincode,
                dob || null, gender || 'Male',
                aadhaar_number, pan_number || null, driving_license_number,
                vehicle_type, vehicle_number, joining_date,
                emergency_contact_name || null, emergency_contact_mobile || null,
                profile_photo || null, aadhaar_photo || null, pan_photo || null,
                driving_license_photo || null, vehicle_rc_photo || null
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Delivery boy profile created successfully',
            data: { id: userId, name, email, role: 'delivery_boy' }
        });
    } catch (err) {
        console.error('Delivery boy registration error:', err);
        res.status(500).json({ success: false, message: 'Failed to register delivery boy' });
    }
};

// =====================================================    
// 4. Get All Delivery Boys (Admin View)
// =====================================================
exports.getAllDeliveryBoys = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.name, u.email, u.created_at,
                    d.mobile, d.alternate_mobile, d.address, d.city, d.state, d.pincode,
                    d.dob, d.gender, d.aadhaar_number, d.pan_number, d.driving_license_number,
                    d.vehicle_type, d.vehicle_number, d.joining_date,
                    d.emergency_contact_name, d.emergency_contact_mobile,
                    d.profile_photo, d.aadhaar_photo, d.pan_photo,
                    d.driving_license_photo, d.vehicle_rc_photo, d.status
             FROM users u
             INNER JOIN delivery_boys d ON d.user_id = u.id
             WHERE u.role = 'delivery_boy'
             ORDER BY u.created_at ASC`
        );
        res.status(200).json({ success: true, data: rows });
    } catch (err) {
        console.error('Fetch delivery boys error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch delivery boys' });
    }
};

// ============================================
// 5. Fetch Single Delivery Boy By ID
// ============================================
exports.getDeliveryBoyById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(
            `SELECT u.id, u.name, u.email, u.created_at,
                    d.mobile, d.alternate_mobile, d.address, d.city, d.state, d.pincode,
                    d.dob, d.gender, d.aadhaar_number, d.pan_number, d.driving_license_number,
                    d.vehicle_type, d.vehicle_number, d.joining_date,
                    d.emergency_contact_name, d.emergency_contact_mobile,
                    d.profile_photo, d.aadhaar_photo, d.pan_photo,
                    d.driving_license_photo, d.vehicle_rc_photo, d.status
             FROM users u
             INNER JOIN delivery_boys d ON d.user_id = u.id
             WHERE u.id = ? AND u.role = 'delivery_boy'`,
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Delivery boy not found' });
        }
        res.status(200).json(rows[0]);
    } catch (err) {
        console.error('Fetch delivery boy error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch delivery boy' });
    }
};

//=============================================================================
// 5b. Get Delivery Boy Status By User ID (fixes DeliveryBoyDashboard 404)
//=============================================================================
exports.getDeliveryBoyStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await db.query(
            `SELECT d.status
             FROM users u
             INNER JOIN delivery_boys d ON d.user_id = u.id
             WHERE u.id = ? AND u.role = 'delivery_boy'`,
            [userId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Delivery boy profile not found for this account.' });
        }
        res.status(200).json({ success: true, status: rows[0].status });
    } catch (err) {
        console.error('Fetch delivery boy status error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch delivery boy status' });
    }
};

//=====================================
// 6. Update Delivery Boy (Admin Context)
//=====================================
exports.updateDeliveryBoy = async (req, res) => {
    try {
        const {
            user_id, name,
            mobile, alternate_mobile, address, city, state, pincode, dob, gender,
            aadhaar_number, pan_number, driving_license_number,
            vehicle_type, vehicle_number, joining_date,
            emergency_contact_name, emergency_contact_mobile,
            profile_photo, aadhaar_photo, pan_photo,
            driving_license_photo, vehicle_rc_photo, status
        } = req.body;

        if (!user_id) {
            return res.status(400).json({ success: false, message: 'user_id is required' });
        }

        if (name) {
            await db.query('UPDATE users SET name = ? WHERE id = ?', [name, user_id]);
        }

        // Schema defines status as enum('Active','Inactive') — normalize casing
        // so lowercase values from the client don't silently fail to match.
        const normalizedStatus = status
            ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
            : 'Active';

        const [result] = await db.query(
            `UPDATE delivery_boys
             SET mobile = ?, alternate_mobile = ?, address = ?, city = ?, state = ?, pincode = ?,
                 dob = ?, gender = ?, aadhaar_number = ?, pan_number = ?, driving_license_number = ?,
                 vehicle_type = ?, vehicle_number = ?, joining_date = ?,
                 emergency_contact_name = ?, emergency_contact_mobile = ?,
                 profile_photo = ?, aadhaar_photo = ?, pan_photo = ?,
                 driving_license_photo = ?, vehicle_rc_photo = ?, status = ?
             WHERE user_id = ?`,
            [
                mobile, alternate_mobile || null, address, city, state, pincode,
                dob || null, gender || 'Male', aadhaar_number, pan_number || null, driving_license_number,
                vehicle_type, vehicle_number, joining_date,
                emergency_contact_name || null, emergency_contact_mobile || null,
                profile_photo || null, aadhaar_photo || null, pan_photo || null,
                driving_license_photo || null, vehicle_rc_photo || null,
                normalizedStatus,
                user_id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'No delivery boy profile found for this user.' });
        }

        res.status(200).json({ success: true, message: 'Delivery boy updated successfully!' });
    } catch (err) {
        console.error('Update delivery boy error:', err);
        res.status(500).json({ success: false, message: 'Failed to update delivery boy' });
    }
};

// ========================
// 7. Delete Delivery Boy
// ========================
exports.deleteDeliveryBoy = async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.query(
            `DELETE FROM users WHERE id = ? AND role = 'delivery_boy'`,
            [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Delivery boy not found' });
        }
        res.status(200).json({ success: true, message: 'Delivery boy removed' });
    } catch (err) {
        console.error('Delete delivery boy error:', err);
        res.status(500).json({ success: false, message: 'Failed to delete delivery boy' });
    }
};


//===============================================================
// 8. Assign Delivery Boy to Order (Admin Context)
//===============================================================
exports.assignDeliveryBoy = async (req, res) => {
  try {
    const { orderId, deliveryBoyId } = req.body;

    // 1. Validation check
    if (!orderId || !deliveryBoyId) {
      return res.status(400).json({
        success: false,
        message: "Missing parameters. Both orderId and deliveryBoyId are required."
      });
    }

    // 2. Insert or Update assignment manifest records using an upsert pattern
    const saveAssignmentQuery = `
      INSERT INTO assign_delivery (order_id, delivery_boy_id, assignment_status, assigned_at)
      VALUES (?, ?, 'assigned', CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE 
        delivery_boy_id = VALUES(delivery_boy_id),
        assignment_status = 'assigned',
        updated_at = CURRENT_TIMESTAMP
    `;
    await db.execute(saveAssignmentQuery, [orderId, deliveryBoyId]);

    // 3. Optional: Sync the global master status in the `orders` table to show it's progressing
    const updateOrderStatusQuery = `
      UPDATE orders 
      SET status = 'shipped', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    await db.execute(updateOrderStatusQuery, [orderId]);

    return res.status(200).json({
      success: true,
      message: `Success: Dispatch partner assigned cleanly to Order #${orderId}.`
    });

  } catch (error) {
    console.error("[DELIVERY ASSIGNMENT DATABASE ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Server error occurred while executing assignment routing command."
    });
  }
};





//==========================================================================
// 9. Get the assign order from the delivery boy (Excluding Rejected Items)
//==========================================================================
exports.getAssignedOrdersByDeliveryBoyId = async (req, res) => {
  try {
    const { delivery_boy_id } = req.query;

    if (!delivery_boy_id) {
      return res.status(400).json({ success: false, message: "delivery_boy_id is required." });
    }

    // CRITICAL: Filter out 'rejected' status so the delivery boy doesn't see it anymore
    const query = `
      SELECT 
        ad.id AS assignment_id,
        ad.assignment_status AS assignment_status,
        o.id AS order_id,
        o.full_name AS customer_name,
        o.phone AS customer_mobile,
        o.address,
        o.city,
        o.pincode,
        o.total_amount AS total_price,
        o.payment_method,
        o.status AS order_status,
        oi.id AS item_id,
        oi.quantity,
        p.name AS product_name
      FROM assign_delivery ad
      INNER JOIN orders o ON ad.order_id = o.id
      INNER JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE ad.delivery_boy_id = ? AND ad.assignment_status != 'rejected'
      ORDER BY ad.id DESC
    `;

    const [rows] = await db.execute(query, [delivery_boy_id]);
    
    const ordersMap = {};

    for (const row of rows) {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          id: row.order_id,
          assignment_id: row.assignment_id,
          assignmentStatus: row.assignment_status || 'assigned', 
          customerName: row.customer_name,
          phone: row.customer_mobile,
          address: `${row.address || ''}, ${row.city || ''} - ${row.pincode || ''}`.replace(/^, |, $/, ''),
          amount: row.total_price,
          paymentMethod: row.payment_method || 'COD',
          status: row.order_status, 
          rawItemsList: []
        };
      }
      if (row.product_name) {
        ordersMap[row.order_id].rawItemsList.push(`${row.product_name} (x${row.quantity})`);
      }
    }

    const formattedOrders = Object.values(ordersMap).map(order => ({
      ...order,
      items: order.rawItemsList.length > 0 ? order.rawItemsList.join(', ') : 'Electronic Merchandise Box'
    }));

    return res.status(200).json({ success: true, data: formattedOrders });
  } catch (error) {
    console.error("================ DATABASE CRASH REPORT ================");
    console.error("Message:", error.message);
    console.error("=======================================================");
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

//==========================================================================
// 10. Handle Accept or Reject requests (Saving history to table)
//==========================================================================
exports.respondToAssignment = async (req, res) => {
  try {
    const { assignment_id, order_id, action } = req.body; 

    if (!assignment_id || !order_id || !action) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    // --- CASE 1: ACCEPT ---
    if (action === 'Accept') {
      await db.execute(
        `UPDATE assign_delivery SET assignment_status = 'out_for_delivery' WHERE id = ?`, 
        [assignment_id]
      );
      await db.execute(
        `UPDATE orders SET status = 'shipped' WHERE id = ?`, 
        [order_id]
      );
      const [orders] = await db.execute('SELECT user_id FROM orders WHERE id = ? LIMIT 1', [order_id]);
      if (orders.length) {
        notificationService.notifyOrderShipped(order_id, orders[0].user_id).catch((error) =>
          console.error('[FCM] Order shipped notification failed:', error.message)
        );
      }
      
      return res.status(200).json({ success: true, message: "Delivery accepted successfully!" });
    } 
    
    // --- CASE 2: REJECT ---
    if (action === 'Reject') {
      // SUCCESS: Instead of deleting, we save the status as 'rejected' right in the table
      await db.execute(
        `UPDATE assign_delivery SET assignment_status = 'rejected' WHERE id = ?`, 
        [assignment_id]
      );
      
      // Reset the order back to 'processing' so it shows up on the Admin panel as unassigned/ready for a new boy
      await db.execute(
        `UPDATE orders SET status = 'processing' WHERE id = ?`, 
        [order_id]
      );
      
      return res.status(200).json({ success: true, message: "Delivery rejected. History saved in database." });
    }

    return res.status(400).json({ success: false, message: "Invalid action type." });
  } catch (error) {
    console.error("Error executing action:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

//==========================================================================
// 11. Delivery completion OTP: request email code, then verify before delivery
//==========================================================================
exports.requestDeliveryCompletionOtp = async (req, res) => {
  try {
    const orderId = Number(req.body.order_id);
    const deliveryBoyId = getAuthenticatedUserId(req);

    if (!Number.isInteger(orderId) || !deliveryBoyId) {
      return res.status(400).json({ success: false, message: "A valid order is required." });
    }

    const [orders] = await db.execute(
      `SELECT o.id, o.email, o.full_name
       FROM orders o
       INNER JOIN assign_delivery ad ON ad.order_id = o.id
       WHERE o.id = ? AND ad.delivery_boy_id = ? AND ad.assignment_status = 'out_for_delivery'`,
      [orderId, deliveryBoyId]
    );

    if (orders.length === 0) {
      return res.status(403).json({ success: false, message: "This delivery is not available for completion." });
    }
    if (!orders[0].email) {
      return res.status(400).json({ success: false, message: "The customer does not have an email address for verification." });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const codeHash = crypto.createHash('sha256').update(otp).digest('hex');
    await ensureDeliveryOtpTable();
    await db.execute(
      `INSERT INTO delivery_completion_otps (order_id, code_hash, expires_at, attempts)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0)
       ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), attempts = 0`,
      [orderId, codeHash]
    );

    const emailResult = await sendDeliveryCompletionOtpEmail({
      email: orders[0].email,
      customerName: orders[0].full_name,
      orderId,
      otp,
    });

    if (!emailResult.sent) {
      await db.execute(`DELETE FROM delivery_completion_otps WHERE order_id = ? AND code_hash = ?`, [orderId, codeHash]);
      return res.status(502).json({ success: false, message: "Could not send the verification email. Please try again." });
    }

    return res.status(200).json({ success: true, message: "Verification code sent to the customer's email.", expiresInMinutes: 10 });
  } catch (error) {
    console.error("Delivery OTP request error:", error);
    return res.status(500).json({ success: false, message: "Could not request the delivery verification code." });
  }
};

//==========================================================================
// 12. Check OTP Verification for Delivery Completion
//==========================================================================
exports.verifyDeliveryCompletionOtp = async (req, res) => {
  let connection;
  try {
    const orderId = Number(req.body.order_id);
    const otp = String(req.body.otp || '').trim();
    const deliveryBoyId = getAuthenticatedUserId(req);

    if (!Number.isInteger(orderId) || !/^\d{6}$/.test(otp) || !deliveryBoyId) {
      return res.status(400).json({ success: false, message: "Enter the six-digit verification code." });
    }

    await ensureDeliveryOtpTable();
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [assignments] = await connection.execute(
      `SELECT id FROM assign_delivery
       WHERE order_id = ? AND delivery_boy_id = ? AND assignment_status = 'out_for_delivery'
       FOR UPDATE`,
      [orderId, deliveryBoyId]
    );
    if (assignments.length === 0) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "This delivery is not available for completion." });
    }

    const [otpRows] = await connection.execute(
      `SELECT code_hash, expires_at, attempts FROM delivery_completion_otps WHERE order_id = ? FOR UPDATE`,
      [orderId]
    );
    if (otpRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Request a new verification code first." });
    }

    const otpRecord = otpRows[0];
    if (new Date(otpRecord.expires_at).getTime() <= Date.now()) {
      await connection.execute(`DELETE FROM delivery_completion_otps WHERE order_id = ?`, [orderId]);
      await connection.commit();
      return res.status(410).json({ success: false, message: "This verification code has expired. Request a new one." });
    }

    const submittedHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (submittedHash !== otpRecord.code_hash) {
      const attempts = Number(otpRecord.attempts) + 1;
      if (attempts >= 5) {
        await connection.execute(`DELETE FROM delivery_completion_otps WHERE order_id = ?`, [orderId]);
      } else {
        await connection.execute(`UPDATE delivery_completion_otps SET attempts = ? WHERE order_id = ?`, [attempts, orderId]);
      }
      await connection.commit();
      return res.status(400).json({ success: false, message: attempts >= 5 ? "Too many incorrect attempts. Request a new code." : "The verification code is incorrect." });
    }

    await connection.execute(`UPDATE orders SET status = 'delivered', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [orderId]);
    await connection.execute(`UPDATE assign_delivery SET assignment_status = 'delivered', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [assignments[0].id]);
    await connection.execute(`DELETE FROM delivery_completion_otps WHERE order_id = ?`, [orderId]);
    await connection.commit();

    const [deliveredOrders] = await db.execute('SELECT user_id FROM orders WHERE id = ? LIMIT 1', [orderId]);
    if (deliveredOrders.length) {
      notificationService.notifyOrderDelivered(orderId, deliveredOrders[0].user_id).catch((error) =>
        console.error('[FCM] Order delivered notification failed:', error.message)
      );
    }

    return res.status(200).json({ success: true, message: "OTP verified. Order marked as delivered." });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Delivery OTP verification error:", error);
    return res.status(500).json({ success: false, message: "Could not verify the delivery code." });
  } finally {
    if (connection) connection.release();
  }
};


//==========================================================================
// 13. Update Delivery Boy Status (Accept / Reject)
//URL Target: POST /api/auth/rest_api_update_delivery_boy_status
//==========================================================================
exports.updateDeliveryBoyStatus = async (req, res) => {
    try {
        const { user_id, status } = req.body;
        if (!user_id || !status) {
            return res.status(400).json({ success: false, message: 'user_id and status are required' });
        }

        const [result] = await db.query(
            'UPDATE delivery_boys SET status = ? WHERE user_id = ?',
            [status, user_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Delivery boy profile not found.' });
        }

        return res.status(200).json({ success: true, message: `Delivery boy status updated to ${status} successfully!` });
    } catch (err) {
        console.error('Update status error:', err);
        return res.status(500).json({ success: false, message: 'Failed to update delivery boy status.' });
    }
};

