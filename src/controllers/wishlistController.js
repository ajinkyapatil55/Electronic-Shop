const db = require('../config/db'); // Path to your MySQL connection pool

// =========================================================================
// 1. GET ALL WISHLIST ITEMS FOR LOGGED IN USER
// =========================================================================
exports.getUserWishlist = async (req, res) => {
    // console.log("\n==============================================");
    // console.log("[WISHLIST FETCH PIPELINE] Incoming data retrieval request.");
    // console.log("[WISHLIST FETCH PIPELINE] User Session Decoded Context:", req.user);
    // console.log("==============================================");

  const userId = req.user?.id || req.user?.ID || req.user?.user_id;

  // Structural User Authentication Validation
  if (!userId) {
    //console.error("[WISHLIST FETCH ERROR] Malformed user session token context parameters.");
    return res.status(400).json({
      success: false,
      message: "Malformed user session token context parameters. Authentication failed."
    });
  }

  const query = `
    SELECT 
      w.id AS wishlist_id,
      w.product_id,
      p.name,
      p.price,
      p.image_url,
      p.category,
      p.stock
    FROM wishlist w
    INNER JOIN products p ON w.product_id = p.id
    WHERE w.user_id = ?
    ORDER BY w.created_at DESC
  `;

  try {
    const [rows] = await db.query(query, [userId]);
    //console.log(`[WISHLIST FETCH SUCCESS] Found ${rows.length} records for User ID: ${userId}`);
    
    return res.status(200).json({
      success: true,
      message: "Wishlist records loaded seamlessly.",
      wishlist: rows
    });
  } catch (error) {
    //console.error("[WISHLIST FETCH EXCEPTION] Database error stack trace:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server operational fault while loading wishlist records." 
    });
  }
};

// =========================================================================
// 2. ADD AN ITEM TO THE WISHLIST
// =========================================================================
exports.addToWishlist = async (req, res) => {
  const userId = req.user?.id || req.user?.ID || req.user?.user_id;
  const userRole = req.user?.role || req.user?.role_id; // Adjust based on your JWT payload schema
  const { productId } = req.body;

  // 1. Role-Based Authorization Check
  // Block admins or staff from utilizing user-centric wishlist features
  if (userRole === 'admin' || req.user?.isAdmin === true) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Administrators are not permitted to maintain standard consumer wishlists."
    });
  }

  // 2. Structural Payload Validation
  if (!productId) {
    return res.status(400).json({
      success: false,
      message: "Required parameter (productId) is missing from request payload."
    });
  }

  const parsedProductId = parseInt(productId, 10);
  if (isNaN(parsedProductId)) {
    return res.status(400).json({
      success: false,
      message: "Provided productId must be a valid numerical value integer representation."
    });
  }

  try {
    // 3. Duplication Safety Check Execution
    const checkQuery = `SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?`;
    const [existing] = await db.query(checkQuery, [userId, parsedProductId]);

    if (existing.length > 0) {
      return res.status(200).json({ 
        success: true, 
        message: "Product is already located inside your wishlist repository matrix." 
      });
    }

    // 4. Database Write Transaction Execution
    const insertQuery = `INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)`;
    const [result] = await db.query(insertQuery, [userId, parsedProductId]);
    
    return res.status(201).json({
      success: true,
      message: "Item added to your wishlist registry successfully."
    });

  } catch (error) {
    console.error("[WISHLIST APPEND EXCEPTION] Database operation system failure:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server execution exception fault while appending item." 
    });
  }
};

// =========================================================================
// 3. DELETE AN ITEM FROM WISHLIST
// =========================================================================
exports.deleteWishlistItem = async (req, res) => {
  // console.log("\n==============================================");
  // console.log("[WISHLIST DROP PIPELINE] Incoming delete transaction request.");
  // console.log("[WISHLIST DROP PIPELINE] Raw Body payload:", req.body);
  // console.log("==============================================");

  const userId = req.user?.id || req.user?.ID || req.user?.user_id;
  const { productId } = req.body;

  // 1. Structural Payload Validation
  if (!productId) {
    //console.error("[WISHLIST DROP ERROR] Required parameter (productId) is missing from payload.");
    return res.status(400).json({
      success: false,
      message: "Required parameter (productId) is missing from request payload."
    });
  }

  const parsedProductId = parseInt(productId, 10);
  if (isNaN(parsedProductId)) {
    //console.error(`[WISHLIST DROP ERROR] Invalid productId supplied: ${productId}`);
    return res.status(400).json({
      success: false,
      message: "Provided productId must be a valid numerical value integer representation."
    });
  }

  const deleteQuery = `DELETE FROM wishlist WHERE user_id = ? AND product_id = ?`;

  try {
    const [result] = await db.query(deleteQuery, [userId, parsedProductId]);
    
    if (result.affectedRows === 0) {
      //console.warn(`[WISHLIST DROP WARN] No relation record found matching Product ID: ${parsedProductId} for User ID: ${userId}`);
      return res.status(404).json({ 
        success: false, 
        message: "Target wishlist entry reference record not located within data matrices." 
      });
    }

    //console.log(`[WISHLIST DROP SUCCESS] Successfully dropped item relationship rows for Product ID: ${parsedProductId}`);
    return res.status(200).json({
      success: true,
      message: "Target registry entry dropped seamlessly from server tables matrix."
    });

  } catch (error) {
    //console.error("[WISHLIST DROP EXCEPTION] Database drop request query failure:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error occurred while performing wishlist drop operation." 
    });
  }
};