// ONLY ONE declaration allowed at the top
const db = require("../config/db");
const notificationService = require('../services/notificationService');

// ================== ADD NEW PRODUCT WITH MULTIPLE IMAGES ==================
exports.saveitems = async (req, res) => {
    try {
        const { product_id, name, price, stock, category, description } = req.body;

        // --- FIX STARTS HERE ---
        let image_url = null;
        if (req.files && req.files.length > 0) {
            // 1. Get an array of all filenames/paths
            const fileNames = req.files.map(file => (file.path && (file.path.startsWith('http://') || file.path.startsWith('https://'))) ? file.path : file.filename);
            
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

        notificationService.notifyNewProduct({ id: result.insertId, name }).catch((error) =>
            console.error('[FCM] New product notification failed:', error.message)
        );
        if (Number(stock) <= Number(process.env.LOW_STOCK_THRESHOLD || 5)) {
            notificationService.notifyLowStock({ id: result.insertId, name, stock }).catch((error) =>
                console.error('[FCM] Low stock notification failed:', error.message)
            );
        }

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

// Search products for the storefront Navbar.
exports.searchProducts = async (req, res) => {
    try {
        const query = String(req.query.q || '').trim();
        if (query.length < 2) {
            return res.status(200).json({ success: true, products: [] });
        }

        const searchTerm = `%${query}%`;
        const [products] = await db.query(
            `SELECT id, product_id, name, price, stock, category, image_url, description
             FROM products
             WHERE name LIKE ?
                OR product_id LIKE ?
                OR category LIKE ?
                OR description LIKE ?
             ORDER BY created_at DESC, id DESC
             LIMIT 8`,
            [searchTerm, searchTerm, searchTerm, searchTerm]
        );

        return res.status(200).json({ success: true, products });
    } catch (error) {
        console.error('Product search error:', error.message);
        return res.status(500).json({ success: false, message: 'Unable to search products.' });
    }
};

