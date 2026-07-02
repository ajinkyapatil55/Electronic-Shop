const pool = require("../config/db");
const bcrypt = require("bcryptjs");

/**
 * 1. GET USER INFO (To fill the Username field in UI)
 */
exports.getLoggedUserInfo = async (req, res) => {
  try {
    // This comes from your 'auth' middleware (JWT)
    const username = req.user.username;

    // Log to server console as requested
    // console.log("-----------------------------------------");
    // console.log(`Fetching info for Logged User: ${username}`);
    // console.log("-----------------------------------------");

    // Fetch full details from table to ensure user exists and is active
    const [rows] = await pool.query(
      "SELECT username, role, name FROM `user` WHERE username = ? AND status = 'Active'",
      [username]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Send the username back to the frontend
    res.status(200).json({
      username: rows[0].username,
      role: rows[0].role,
      name: rows[0].name
    });
  } catch (error) {
    console.error("Error in getLoggedUserInfo:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * 2. UPDATE PASSWORD LOGIC
 */
exports.changePassword = async (req, res, next) => {
  try {
    const { username, old_password, new_password, confirm_password } = req.body;

    // // Log the update attempt to the server console
    // console.log("-----------------------------------------");
    // console.log(`Password Update Attempt`);
    // console.log(`Logged User (Token): ${req.user.username}`);
    // console.log(`Target Username (Body): ${username}`);
    // console.log("-----------------------------------------");

    // Security check: Only allow the user to change their own password
    if (req.user.username !== username) {
      console.log(`SECURITY ALERT: ${req.user.username} tried to update ${username}`);
      return res.status(403).json({ message: "Unauthorized account access." });
    }

    // Validation
    if (!old_password) return res.status(400).json({ message: "Old password is required." });
    if (new_password !== confirm_password) {
      return res.status(400).json({ message: "Passwords do not match." });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ message: "New password must be 6+ characters." });
    }

    // Fetch user from DB
    const [rows] = await pool.query(
      "SELECT user_id, password FROM `user` WHERE username = ?",
      [username]
    );

    if (rows.length === 0) return res.status(404).json({ message: "User not found." });

    const user = rows[0];

    // Verify Old Password
    const isMatch = await bcrypt.compare(old_password, user.password);
    if (!isMatch) {
      console.log(`FAILED: Incorrect old password for ${username}`);
      return res.status(400).json({ message: "The old password you entered is incorrect." });
    }

    // Hash New Password
    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(new_password, salt);

    // Update Query
    const [result] = await pool.query(
      "UPDATE `user` SET password = ? WHERE user_id = ?",
      [hashedNewPassword, user.user_id]
    );

    if (result.affectedRows > 0) {
      console.log(`SUCCESS: Password updated for ${username}`);
      return res.status(200).json({
        status: 200,
        message: "Success",
        description: "Password changed successfully."
      });
    } else {
      return res.status(500).json({ message: "Update failed in database." });
    }
  } catch (error) {
    console.error("Internal Error:", error);
    next(error);
  }
};