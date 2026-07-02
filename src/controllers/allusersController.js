const db = require('../config/db');

const getAllUsers = async (req, res) => {
    try {
        // Get all users from the database
        const [rows] = await db.query(
            'SELECT id, name, email, role, created_at FROM users'
        );

        return res.status(200).json({
            success: true,
            count: rows.length,
            message: 'All users fetched successfully',
            data: rows
        });

    } catch (error) {
        console.error('Error in getAllUsers:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};

module.exports = {
    getAllUsers
};