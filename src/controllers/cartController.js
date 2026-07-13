const db = require("../config/db");

// ==========================================
// 1. ADD TO CART
// ==========================================
exports.addToCart = async (req, res) => {
    try {
        const { product_id, quantity, user_id } = req.body;
        
        // Validation: Ensure all inputs exist
        if (!user_id || !product_id) {
            return res.status(400).json({ success: false, message: "User ID and Product ID are required" });
        }
        
        const u_id = parseInt(user_id);
        const p_id = parseInt(product_id);
        const qty = parseInt(quantity) || 1;

        // Validation: Prevent NaN values from causing database crashes
        if (isNaN(u_id) || isNaN(p_id)) {
            return res.status(400).json({ success: false, message: "User ID and Product ID must be valid numbers" });
        }

        // Security Check: Verify quantity is valid and positive
        if (qty < 1) {
            return res.status(400).json({ success: false, message: "Quantity must be at least 1" });
        }

        // Check if product already exists in THIS specific user's cart
        const [existing] = await db.query(
            "SELECT id, quantity FROM cart WHERE user_id = ? AND product_id = ?", 
            [u_id, p_id]
        );

        if (existing.length > 0) {
            const newQty = existing[0].quantity + qty;
            // Scoped securely by row ID
            await db.query("UPDATE cart SET quantity = ? WHERE id = ?", [newQty, existing[0].id]);
            return res.status(200).json({ success: true, message: "Quantity updated successfully" });
        } else {
            // Insert fresh row matching user to product
            await db.query(
                "INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)", 
                [u_id, p_id, qty]
            );
            return res.status(201).json({ success: true, message: "Product added to cart" });
        }
    } catch (error) {
        console.error("Cart Add Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// ==========================================
// 2. GET CART ITEMS (Strictly Isolated by User ID)
// ==========================================
exports.getCartItems = async (req, res) => {
    try {
        const { user_id } = req.query;

        // Block empty, undefined, or missing user evaluations immediately
        if (!user_id || user_id === 'null' || user_id === 'undefined') {
            return res.status(400).json({ success: false, message: "A valid User ID is required" });
        }

        const u_id = parseInt(user_id, 10);
        if (isNaN(u_id)) {
            return res.status(400).json({ success: false, message: "Invalid User ID format" });
        }

        // Running query securely bound to the verified u_id parameter
        const sql = `
            SELECT 
                c.id AS cart_id, 
                p.id AS product_id, 
                p.name, 
                p.price, 
                p.image_url, 
                c.quantity,
                c.user_id,
                COALESCE(rv.average_rating, 0) AS average_rating,
                COALESCE(rv.total_reviews, 0) AS total_reviews
            FROM cart c
            JOIN products p ON c.product_id = p.id
            LEFT JOIN (
                SELECT
                    product_id,
                    ROUND(AVG(rating), 1) AS average_rating,
                    COUNT(*) AS total_reviews
                FROM product_reviews
                WHERE status = 'active'
                GROUP BY product_id
            ) rv ON rv.product_id = p.id
            WHERE c.user_id = ?
        `;

        const [rows] = await db.query(sql, [u_id]);

        // Explicitly double check array contents before responding
        res.status(200).json({
            success: true,
            cart: rows
        });
    } catch (error) {
        console.error("Fetch Cart Error:", error);
        res.status(500).json({ success: false, message: "Database error occurred" });
    }
};

// ==========================================
// 3. UPDATE QUANTITY (Security Audited)
// ==========================================
exports.updateCartQty = async (req, res) => {
    try {
        const { cart_id, quantity, user_id } = req.body;

        if (!user_id || !cart_id) {
            return res.status(400).json({ success: false, message: "Missing User ID or Cart ID" });
        }

        const u_id = parseInt(user_id);
        const c_id = parseInt(cart_id);
        const qty = parseInt(quantity);

        // Validation: Prevent database crashes on NaN inputs
        if (isNaN(u_id) || isNaN(c_id) || isNaN(qty)) {
            return res.status(400).json({ success: false, message: "Invalid ID or quantity format" });
        }

        // If quantity is 0 or less, automatically remove the item securely
        if (qty <= 0) {
            const [result] = await db.query(
                "DELETE FROM cart WHERE id = ? AND user_id = ?", 
                [c_id, u_id]
            );
            if (result.affectedRows === 0) {
                return res.status(403).json({ success: false, message: "Unauthorized or item not found." });
            }
            return res.status(200).json({ success: true, message: "Item removed from cart" });
        }

        // Securely scoped update statement ensuring a user can only alter their own row
        const [result] = await db.query(
            "UPDATE cart SET quantity = ? WHERE id = ? AND user_id = ?", 
            [qty, c_id, u_id]
        );

        if (result.affectedRows === 0) {
            return res.status(403).json({ 
                success: false, 
                message: "Unauthorized action. You can only update your own cart." 
            });
        }

        res.status(200).json({ success: true, message: "Quantity updated successfully" });
    } catch (error) {
        console.error("Update Cart Qty Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// ==========================================
// 4. REMOVE ITEM (Strict user containment validation)
// ==========================================
exports.removeCartItem = async (req, res) => {
    try {
        const { id } = req.params; // Cart Entry ID
        const user_id = req.query.user_id || req.body.user_id || req.headers['x-user-id']; 

        if (!user_id) {
            return res.status(400).json({ success: false, message: "User ID is required to remove item" });
        }

        const u_id = parseInt(user_id);
        const c_id = parseInt(id);

        if (isNaN(u_id) || isNaN(c_id)) {
            return res.status(400).json({ success: false, message: "Invalid Cart ID or User ID" });
        }

        // Secure Deletion Constraint: Matches row ID AND user ID
        const [result] = await db.query(
            "DELETE FROM cart WHERE id = ? AND user_id = ?", 
            [c_id, u_id]
        );

        if (result.affectedRows === 0) {
            return res.status(403).json({ 
                success: false, 
                message: "Unauthorized action. You cannot remove this item." 
            });
        }

        res.status(200).json({ success: true, message: "Item removed from cart" });
    } catch (error) {
        console.error("Remove Cart Item Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};