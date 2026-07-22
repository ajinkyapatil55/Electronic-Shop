const db = require('../config/db');
const notificationService = require('../services/notificationService');

// ==========================================
// 1. CREATE COUPON
// ==========================================
exports.createCoupon = async (req, res) => {
    try {
        // ✅ FIX: Accept both startDate (from frontend) and expiryDate / toDate
        const {
            code,
            discountValue,
            startDate,
            expiryDate,
            targetType,
            targetUserId
        } = req.body;

        // Validation
        if (!code || !discountValue || !expiryDate) {
            return res.status(400).json({
                success: false,
                message: "Please provide code, discountValue, and expiryDate."
            });
        }

        const formattedCode   = code.toUpperCase().trim();
        const parsedDiscount  = parseFloat(discountValue);

        if (isNaN(parsedDiscount) || parsedDiscount <= 0) {
            return res.status(400).json({
                success: false,
                message: "discountValue must be a positive number."
            });
        }

        if (targetType === 'particular' && !targetUserId) {
            return res.status(400).json({
                success: false,
                message: "A targetUserId is required when targetType is 'particular'."
            });
        }

        // Unique code check
        const [existing] = await db.query(
            'SELECT id FROM coupons WHERE code = ? LIMIT 1',
            [formattedCode]
        );
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: `Coupon code "${formattedCode}" already exists in the system.`
            });
        }

        const userIdValue = targetType === 'particular' ? parseInt(targetUserId, 10) : null;
        if (targetType === 'particular' && isNaN(userIdValue)) {
            return res.status(400).json({
                success: false,
                message: "targetUserId must be a valid integer."
            });
        }

        // ✅ FIX: Use startDate if your table has a start_date column,
        //         otherwise just store expiryDate. Adjust the SQL to match your table.
        const sqlQuery = `
            INSERT INTO coupons 
                (code, discount_amount, target_type, user_id, start_date, expiry_date, active)
            VALUES 
                (?, ?, ?, ?, ?, ?, 1)
        `;

        const [result] = await db.query(sqlQuery, [
            formattedCode,
            parsedDiscount,
            targetType || 'all',
            userIdValue,
            startDate ? new Date(startDate) : new Date(),
            new Date(expiryDate)
        ]);

        const [recipients] = targetType === 'particular'
            ? await db.query('SELECT id FROM users WHERE id = ?', [userIdValue])
            : await db.query("SELECT id FROM users WHERE role = 'user'");
        notificationService.notifyCouponAvailable(
            { code: formattedCode, discountAmount: parsedDiscount },
            recipients.map((user) => user.id)
        ).catch((error) => console.error('[FCM] Coupon notification failed:', error.message));

        // ✅ FIX: Return field names that match what the frontend expects
        return res.status(201).json({
            success: true,
            message: `Coupon "${formattedCode}" created successfully!`,
            data: {
                id:             result.insertId,
                code:           formattedCode,
                discount_amount: parsedDiscount,   // frontend normalises → discountValue
                target_type:    targetType || 'all', // frontend normalises → targetType
                user_id:        userIdValue,
                start_date:     startDate,
                expiry_date:    expiryDate           // frontend normalises → expiryDate
            }
        });

    } catch (error) {
        console.error("createCoupon DB error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error while creating coupon."
        });
    }
};

// ==========================================
// 2. GET ACTIVE COUPONS
// ==========================================
exports.getActiveCoupons = async (req, res) => {
    try {
        // ✅ FIX: Return both target_type and user_id so frontend can filter
        const sql = `
            SELECT 
                id,
                code,
                discount_amount,
                target_type,
                user_id,
                start_date,
                expiry_date,
                active
            FROM coupons
            WHERE active = 1
            ORDER BY created_at DESC
        `;

        const [rows] = await db.query(sql);

        return res.status(200).json({
            success: true,
            count: rows.length,
            data: rows
        });

    } catch (error) {
        console.error("getActiveCoupons DB error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch coupons from the database."
        });
    }
};


// ==========================================
// 3. VALIDATE / APPLY COUPON
// ==========================================
exports.validateCoupon = async (req, res) => {
    try {
        const { code, userId } = req.body; // Expecting coupon code and the logged-in user's ID

        if (!code) {
            return res.status(400).json({
                success: false,
                message: "Coupon code is required."
            });
        }

        const formattedCode = code.toUpperCase().trim();
        const currentDateTime = new Date();

        // 1. Fetch coupon details from DB
        const sql = `SELECT * FROM coupons WHERE code = ? LIMIT 1`;
        const [rows] = await db.query(sql, [formattedCode]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Invalid coupon code."
            });
        }

        const coupon = rows[0];

        // 2. Check if coupon is active
        if (coupon.active !== 1) {
            return res.status(400).json({
                success: false,
                message: "This coupon is no longer active."
            });
        }

        // 3. Check if coupon has started yet
        if (new Date(coupon.start_date) > currentDateTime) {
            return res.status(400).json({
                success: false,
                message: "This coupon is not valid yet."
            });
        }

        // 4. Check if coupon has expired
        if (new Date(coupon.expiry_date) < currentDateTime) {
            return res.status(400).json({
                success: false,
                message: "This coupon has expired."
            });
        }

        // 5. Check coupon usage limits
        if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
            return res.status(400).json({
                success: false,
                message: "This coupon usage limit has been reached."
            });
        }

        // 6. Check targeted user restriction
        if (coupon.target_type === 'particular') {
            if (!userId || parseInt(userId, 10) !== parseInt(coupon.user_id, 10)) {
                return res.status(403).json({
                    success: false,
                    message: "This exclusive coupon is not valid for your account."
                });
            }
        }

        // Coupon is perfectly valid! Return the data structure the frontend expects.
        return res.status(200).json({
            success: true,
            message: "Coupon applied successfully!",
            data: {
                id: coupon.id,
                code: coupon.code,
                discount_amount: coupon.discount_amount,
                discount_percent: coupon.discount_percent,
                target_type: coupon.target_type
            }
        });

    } catch (error) {
        console.error("validateCoupon DB error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while validating the coupon."
        });
    }
};

// ==========================================
// 4. GET USER USED COUPONS
// ==========================================
exports.getUsedCoupons = async (req, res) => {
  const userId = req.user?.id || req.user?.userId;
 
  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized." });
  }
 
  try {
    const [rows] = await db.execute(
      `SELECT c.code
       FROM coupon_usage cu
       JOIN coupons c ON c.id = cu.coupon_id
       WHERE cu.user_id = ?`,
      [userId]
    );
 
    return res.status(200).json({
      success: true,
      data: rows.map(r => r.code)
    });
  } catch (error) {
    console.error("[GET USED COUPONS ERROR]", error);
    return res.status(500).json({ success: false, message: "Server error while retrieving used coupons." });
  }
};

// ==========================================
// 5. DELETE COUPON  (NEW)
// ==========================================
exports.deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id, 10))) {
            return res.status(400).json({
                success: false,
                message: "A valid coupon id is required."
            });
        }

        // Confirm the coupon exists before attempting delete, so we can
        // return a clear 404 instead of a silent no-op.
        const [existing] = await db.query(
            'SELECT id, code FROM coupons WHERE id = ? LIMIT 1',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Coupon not found. It may have already been deleted."
            });
        }

        // Remove any usage history tied to this coupon first to avoid
        // foreign-key constraint failures, then delete the coupon itself.
        await db.query('DELETE FROM coupon_usage WHERE coupon_id = ?', [id]);
        const [result] = await db.query('DELETE FROM coupons WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(500).json({
                success: false,
                message: "Delete failed — no rows were affected."
            });
        }

        return res.status(200).json({
            success: true,
            message: `Coupon "${existing[0].code}" was deleted successfully.`,
            data: { id: parseInt(id, 10) }
        });

    } catch (error) {
        console.error("deleteCoupon DB error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error while deleting coupon."
        });
    }
};
