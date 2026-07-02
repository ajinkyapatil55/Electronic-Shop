const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.login = async (email, password) => {
  const [users] = await pool.query(
    "SELECT * FROM users WHERE email = ?",
    [email]
  );

  if (!users.length) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const user = users[0];

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
};