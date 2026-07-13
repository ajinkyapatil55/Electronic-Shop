// ONLY ONE declaration allowed at the top
const db = require("../config/db");

// ================== SAVE / UPDATE A USER ADDRESS ==================
exports.saveAddress = async (req, res) => {
    try {
        const { phone, houseNo, colonyStreet, landmark, cityVillage, district, state, pincode, type } = req.body;

        // Extract logged-in user ID from authentication middleware, or fallback to body/default
        const user_id = req.user ? req.user.id : (req.body.user_id || 1);

        // Server-side validation
        if (!phone || !houseNo || !colonyStreet || !cityVillage || !state || !pincode) {
            return res.status(400).json({ 
                success: false, 
                message: "Missing required address fields." 
            });
        }

        // Dynamically build a single address string to match what your React component reads
        const dynamicAddressStr = [
            houseNo,
            colonyStreet,
            landmark ? `Near ${landmark}` : null,
            cityVillage,
            district,
            `${state} - ${pincode}`
        ].filter(Boolean).join(', ');

        // Optional coordinates payload from Leaflet map mapping
        const lat = req.body.lat || null;
        const lng = req.body.lng || null;

        const sql = `
            INSERT INTO user_addresses 
            (user_id, phone, address_string, type, lat, lng, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `;

        const values = [
            user_id, 
            phone, 
            dynamicAddressStr, 
            type || 'home', 
            lat, 
            lng
        ];

        const [result] = await db.query(sql, values);

        // Return the object layout matching your React frontend state expectations
        res.status(200).json({
            success: true,
            message: "Address saved successfully!",
            id: result.insertId,
            phone,
            addressString: dynamicAddressStr,
            type: type || 'home',
            lat,
            lng
        });

    } catch (error) {
        console.error("❗ DATABASE ERROR:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ================== FETCH ALL SAVED ADDRESSES FOR HOME PAGE / CHECKOUT ==================
exports.getUserAddresses = async (req, res) => {
    try {
        // Extract logged-in user ID from authentication middleware, or fallback to default
        const user_id = req.user ? req.user.id : 1;

        const sql = `
            SELECT 
                id, 
                phone, 
                address_string AS addressString, 
                type, 
                lat, 
                lng,
                created_at
            FROM user_addresses 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `;

        const [rows] = await db.query(sql, [user_id]);

        res.status(200).json({
            success: true,
            addresses: rows
        });

    } catch (error) {
        console.error("Error in getUserAddresses:", error.message);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ================== DELETE A SPECIFIC SAVED ADDRESS ==================
exports.deleteAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
        const user_id = req.user ? req.user.id : 1;

        const sql = `DELETE FROM user_addresses WHERE id = ? AND user_id = ?`;
        
        const [result] = await db.query(sql, [addressId, user_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: "Address not found or unauthorized." 
            });
        }

        res.status(200).json({
            success: true,
            message: "Address removed successfully!"
        });

    } catch (error) {
        console.error("Error in deleteAddress:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};