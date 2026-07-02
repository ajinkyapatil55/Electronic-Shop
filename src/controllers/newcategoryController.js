// ONLY ONE declaration allowed at the top
const db = require("../config/db");

// =========================================================================
// 1. FETCH ALL CATEGORIES (Home / Dashboard Table View)
// =========================================================================
// @desc    GET all categories
// @route   GET /api/categories/rest_api_get_all_categories
exports. getCategories = async (req, res) => {
    try {
        // Use a standard query structure matching your product list logic
        const sql = "SELECT * FROM categories ORDER BY id ASC";
        const [rows] = await db.query(sql);
        
        res.status(200).json(rows);
        
    } catch (error) {
        console.error("❗ DATABASE ERROR (GET ALL CATEGORIES):", error.message);
        res.status(500).json({ 
            success: false, 
            message: "Fetch failed", 
            error: error.message 
        });
    }
};

// =========================================================================
// 2. CREATE NEW CATEGORY
// =========================================================================
// @desc    Add new category
// @route   POST /api/categories/rest_api_add_category
exports.addCategory = async (req, res) => {
    try {
        const { name, slug, description } = req.body;

        // Validation block
        if (!name || !slug) {
            return res.status(400).json({ 
                success: false, 
                message: "Name and Slug are required fields" 
            });
        }

        // 'status' column defaults automatically to 'active' inside MySQL schema configuration
        const sql = `
            INSERT INTO categories (name, slug, description) 
            VALUES (?, ?, ?)
        `;
        const values = [name, slug, description];

        const [result] = await db.query(sql, values);

        res.status(201).json({ 
            success: true,
            message: "Category added successfully", 
            id: result.insertId 
        });

    } catch (error) {
        console.error("❗ DATABASE ERROR (ADD CATEGORY):", error.message);
        
        // Handle unique constraint violations safely
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false, 
                message: "Category Name or URL Slug already exists" 
            });
        }
        
        res.status(500).json({ 
            success: false, 
            message: "Database error during execution", 
            error: error.message 
        });
    }
};

// =========================================================================
// 3. UPDATE EXISTING CATEGORY
// =========================================================================
// @desc    Update existing category
// @route   PUT /api/categories/rest_api_update_category/:id
exports.updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug, description, status } = req.body;
        
        // Validation block
        if (!name || !slug) {
            return res.status(400).json({ 
                success: false, 
                message: "Name and Slug are required fields" 
            });
        }

        // Fallback option ensuring category status retains a clean value
        const currentStatus = status || 'active';

        const sql = `
            UPDATE categories 
            SET name = ?, slug = ?, description = ?, status = ? 
            WHERE id = ?
        `;
        const values = [name, slug, description, currentStatus, id];

        const [result] = await db.query(sql, values);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: "Category not found" 
            });
        }

        res.status(200).json({ 
            success: true,
            message: "Category updated successfully" 
        });

    } catch (error) {
        console.error("❗ DATABASE ERROR (UPDATE CATEGORY):", error.message);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false, 
                message: "Category Name or Slug matches a separate existing entry" 
            });
        }
        
        res.status(500).json({ 
            success: false, 
            message: "Update execution failed", 
            error: error.message 
        });
    }
};

// =========================================================================
// 4. DELETE A CATEGORY
// =========================================================================
// @desc    Delete category
// @route   DELETE /api/categories/rest_api_delete_category/:id
exports.deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        
        const sql = "DELETE FROM categories WHERE id = ?";
        const [result] = await db.query(sql, [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: "Category not found" 
            });
        }

        res.status(200).json({ 
            success: true,
            message: "Category deleted successfully" 
        });

    } catch (error) {
        console.error("❗ DATABASE ERROR (DELETE CATEGORY):", error.message);
        res.status(500).json({ 
            success: false, 
            message: "Delete failed. This category might be tied to existing active products.", 
            error: error.message 
        });
    }
};