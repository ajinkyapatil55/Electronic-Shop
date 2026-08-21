const db = require('../config/db');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

//===============================
// GET User Profile Data
//===============================
const getUserProfile = async (req, res) => {
  try {
    const userId = req.params.id || (req.user && req.user.id);

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required.' });
    }

    const [rows] = await db.query(
      `SELECT id, name, email, phone, address, profile_image, role, created_at, updated_at 
       FROM users WHERE id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    
    return res.status(200).json({
      success: true,
      message: 'User profile fetched successfully.',
      data: rows[0]
    });
  } catch (error) {
    console.error('Error in getUserProfile:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: error.message });
  }
};

//===================================================================
// UPDATE User Profile (Phone, Address, Profile Image, Name, Email)
//===================================================================
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.body.user_id || (req.user && req.user.id);
    const { name, email, phone, address } = req.body;

    if (!userId || !name || !email) {
      return res.status(400).json({ success: false, message: 'User ID, name, and email are required fields.' });
    }

    // Check if email belongs to a different account
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [email, userId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'This email is already in use by another user.' });
    }

    // Retrieve existing image path
    const [currentUser] = await db.query('SELECT profile_image FROM users WHERE id = ?', [userId]);
    if (currentUser.length === 0) {
      return res.status(404).json({ success: false, message: 'User record not found.' });
    }
    
    let imagePath = currentUser[0].profile_image;

    // Handle new uploaded image
    if (req.file) {
      imagePath = `uploads/avatars/${req.file.filename}`;

      // Delete old photo if it exists on disk
      if (currentUser[0].profile_image) {
        const oldFile = path.join(__dirname, '..', currentUser[0].profile_image);
        try {
          if (fs.existsSync(oldFile)) {
            fs.unlinkSync(oldFile);
          }
        } catch (unlinkErr) {
          console.warn('Failed to remove old avatar image:', unlinkErr.message);
        }
      }
    }

    // Update query
    const sqlQuery = `
      UPDATE users 
      SET name = ?, email = ?, phone = ?, address = ?, profile_image = ?, updated_at = NOW() 
      WHERE id = ?
    `;

    await db.query(sqlQuery, [
      name,
      email,
      phone || null,
      address || null,
      imagePath || null,
      userId
    ]);

    // Fetch updated record
    const [updatedRows] = await db.query(
      `SELECT id, name, email, phone, address, profile_image, role, created_at, updated_at 
       FROM users WHERE id = ?`,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully!',
      data: updatedRows[0]
    });
  } catch (error) {
    console.error('Error in updateUserProfile:', error);
    return res.status(500).json({ success: false, message: 'Failed to update profile.', error: error.message });
  }
};

//===============================
// CHANGE Password
//===============================
const changePassword = async (req, res) => {
  try {
    const userId = req.body.user_id || (req.user && req.user.id);
    const { current_password, new_password } = req.body;

    if (!userId || !current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
    }

    const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [userId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(current_password, rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [hashedPassword, userId]);

    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Error in changePassword:', error);
    return res.status(500).json({ success: false, message: 'Server error while changing password.', error: error.message });
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  changePassword
};