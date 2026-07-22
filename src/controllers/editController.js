const db = require("../config/db");
const notificationService = require('../services/notificationService');

// Fetch single product for the Edit Form
exports.getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query("SELECT * FROM products WHERE product_id = ?", [id]);
        if (rows.length === 0) return res.status(404).json({ message: "Product not found" });
        
        // Return directly as rows[0] or wrap in a product object to match frontend expectancies
        res.status(200).json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update product (Now with full dynamic multiple-image handlers!)
exports.updateProduct = async (req, res) => {
    try {
        // 1. Extract plain text values processed safely by Multer
        const { product_id, name, price, stock, category, description, existingImages } = req.body;

        if (!product_id) {
            return res.status(400).json({ success: false, message: "Product ID is missing." });
        }

        // 2. Resolve previously saved images that the user DID NOT delete
        let finalImagesArray = [];
        if (existingImages) {
            try {
                // Parses the string array back into a real JavaScript Array
                finalImagesArray = JSON.parse(existingImages);
            } catch (e) {
                finalImagesArray = [existingImages];
            }
        }

        // 3. Append newly uploaded images array parsed via req.files (if any)
        if (req.files && req.files.length > 0) {
            const newUploadedFiles = req.files.map(file => file.filename);
            finalImagesArray = [...finalImagesArray, ...newUploadedFiles];
        }

        // 4. Format everything back into a stringified JSON layout to match your DB structure
        // If it's a single image, you can optionally store it as a raw string, 
        // but stringified array format works seamlessly for 1 to 5 images.
        const dbImageValue = JSON.stringify(finalImagesArray);

        const [previousRows] = await db.query(
            'SELECT id, name, stock FROM products WHERE product_id = ? LIMIT 1',
            [product_id]
        );
        const previousProduct = previousRows[0];

        // 5. Update the Database including the updated image_url column!
        const sql = `
            UPDATE products 
            SET name = ?, price = ?, stock = ?, category = ?, description = ?, image_url = ? 
            WHERE product_id = ?
        `;
        
        const [result] = await db.query(sql, [
            name, 
            price, 
            stock, 
            category, 
            description, 
            dbImageValue, // Saved inside image_url column
            product_id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Target product record not found." });
        }

        const stockValue = Number(stock);
        if (stockValue <= Number(process.env.LOW_STOCK_THRESHOLD || 5)) {
            notificationService.notifyLowStock({ id: previousProduct.id, name, stock: stockValue }).catch((error) =>
                console.error('[FCM] Low stock notification failed:', error.message)
            );
        }
        if (Number(previousProduct.stock) <= 0 && stockValue > 0) {
            const [wishlistUsers] = await db.query('SELECT user_id FROM wishlist WHERE product_id = ?', [previousProduct.id]);
            notificationService.notifyWishlistBackInStock({ id: previousProduct.id, name }, wishlistUsers.map((row) => row.user_id)).catch((error) =>
                console.error('[FCM] Wishlist restock notification failed:', error.message)
            );
        }

        res.status(200).json({ success: true, message: "Product updated completely!" });
    } catch (error) {
        console.error("Backend Error on Update Route:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete product
exports.deleteProduct = async (req, res) => {
    try {
        const { product_id } = req.body;
        
        if (!product_id) {
            return res.status(400).json({ success: false, message: "Product ID is required for deletion." });
        }

        await db.query("DELETE FROM products WHERE product_id = ?", [product_id]);
        res.status(200).json({ success: true, message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
