// ONLY ONE declaration allowed at the top
const db = require("../config/db");

// ================== ADD NEW PRODUCT WITH MULTIPLE IMAGES ==================
exports.saveitems = async (req, res) => {
    try {
        const { product_id, name, price, stock, category, description } = req.body;

        // --- FIX STARTS HERE ---
        let image_url = null;
        if (req.files && req.files.length > 0) {
            // 1. Get an array of all filenames
            const fileNames = req.files.map(file => file.filename);
            
            // 2. Convert the array to a JSON string: '["img1.jpg", "img2.jpg"]'
            image_url = JSON.stringify(fileNames); 
        }
        // --- FIX ENDS HERE ---

        const user_id = req.user ? req.user.id : (req.body.user_id || 1);

        const sql = `
            INSERT INTO products 
            (product_id, name, price, stock, category, image_url, description, user_id, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const values = [
            product_id, name, price, stock, category, 
            image_url, // This now contains the JSON string of ALL images
            description, user_id
        ];

        const [result] = await db.query(sql, values);

        res.status(200).json({
            success: true,
            message: "Product saved with multiple images!",
            productId: result.insertId
        });

    } catch (error) {
        console.error("❗ DATABASE ERROR:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
// fetch to data on Home page

exports.getAllProducts = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT
                p.*,
                COALESCE(rv.average_rating, 0) AS average_rating,
                COALESCE(rv.total_reviews, 0) AS total_reviews
             FROM products p
             LEFT JOIN (
                SELECT
                    product_id,
                    ROUND(AVG(rating), 1) AS average_rating,
                    COUNT(*) AS total_reviews
                FROM product_reviews
                WHERE status = 'active'
                GROUP BY product_id
             ) rv ON rv.product_id = p.id
             ORDER BY p.created_at ASC`
        );
        
        res.status(200).json({
            success: true,
            products: rows 
        });
    } catch (error) {
        console.error("Error in getAllProducts:", error.message);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

