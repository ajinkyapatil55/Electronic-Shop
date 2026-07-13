const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

/**
 * ============================================================================
 * REGISTER USER
 * ============================================================================
 * Creates a new customer account or staff account dynamically based on incoming body role
 * ============================================================================
 */
exports.register = async (req, res) => {
  try {
    // console.log("======================================");
    // console.log("REGISTER API HIT");
    // console.log("RAW BODY:", req.body);

    const { name, email, password, confirmPassword, role } = req.body;

    // console.log("NAME:", name);
    // console.log("EMAIL:", email);
    // console.log("PASSWORD:", password);
    // console.log("CONFIRM PASSWORD:", confirmPassword);
    // console.log("ROLE FROM FRONTEND:", role);
    // console.log("ROLE TYPE:", typeof role);

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({
        message: "Please fill all required fields",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        message: "Passwords do not match",
      });
    }

    const [existingUser] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        message: "Email already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const allowedRoles = ["user", "admin", "delivery_boy"];
    const cleanedRole = typeof role === "string" ? role.trim() : "";
    const assignedRole = allowedRoles.includes(cleanedRole)
      ? cleanedRole
      : "user";

    // console.log("CLEANED ROLE:", cleanedRole);
    // console.log("FINAL ASSIGNED ROLE:", assignedRole);

    const [result] = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      [name, email, hashedPassword, assignedRole]
    );

    // console.log("USER INSERTED ID:", result.insertId);
    // console.log("ROLE SAVED IN DB:", assignedRole);
    // console.log("======================================");

    const token = jwt.sign(
      {
        id: result.insertId,
        email,
        role: assignedRole,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      message: "Registration successful",
      token,
      user: {
        id: result.insertId,
        name,
        email,
        role: assignedRole,
      },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({
      message: err.message,
    });
  }
};

/**
 * ============================================================================
 * LOGIN USER
 * ============================================================================
 * Authenticates existing user
 * ============================================================================
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const [users] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (!users.length) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const user = users[0];

    if (!user.password) {
      return res.status(500).json({
        message: "Password missing in database",
      });
    }

    const isMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "JWT_SECRET is missing",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);

    return res.status(500).json({
      message: err.message,
    });
  }
};
















































// const pool = require("../config/db");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");

// /**
//  * ============================================================================
//  * REGISTER USER
//  * ============================================================================
//  * Creates a new customer account
//  * ============================================================================
//  */
// exports.register = async (req, res) => {
//   try {
//     const { name, email, password, confirmPassword } = req.body;

//     // Validate required fields
//     if (!name || !email || !password || !confirmPassword) {
//       return res.status(400).json({
//         message: "Please fill all required fields",
//       });
//     }

//     // Password length validation
//     if (password.length < 6) {
//       return res.status(400).json({
//         message: "Password must be at least 6 characters",
//       });
//     }

//     // Password confirmation
//     if (password !== confirmPassword) {
//       return res.status(400).json({
//         message: "Passwords do not match",
//       });
//     }

//     // Check if email already exists
//     const [existingUser] = await pool.query(
//       "SELECT id FROM users WHERE email = ?",
//       [email]
//     );

//     if (existingUser.length > 0) {
//       return res.status(409).json({
//         message: "Email already registered",
//       });
//     }

//     // Hash password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Insert new user
//     const [result] = await pool.query(
//   `
//   INSERT INTO users (name, email, password, role)
//   VALUES (?, ?, ?, ?)
//   `,
//   [name, email, hashedPassword, "user"]
// );

//     // Generate JWT
//     const token = jwt.sign(
//       {
//         id: result.insertId,
//         email,
//         role: "user",
//       },
//       process.env.JWT_SECRET,
//       {
//         expiresIn: "7d",
//       }
//     );

//     return res.status(201).json({
//       message: "Registration successful",
//       token,
//       user: {
//         id: result.insertId,
//         name,
//         email,
//         role: "user",
//       },
//     });

//   } catch (err) {
//     console.error("REGISTER ERROR:", err);

//     return res.status(500).json({
//       message: err.message,
//     });
//   }
// };

// /**
//  * ============================================================================
//  * LOGIN USER
//  * ============================================================================
//  * Authenticates existing user
//  * ============================================================================
//  */
// exports.login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     const [users] = await pool.query(
//       "SELECT * FROM users WHERE email = ?",
//       [email]
//     );

//     if (!users.length) {
//       return res.status(401).json({
//         message: "Invalid email or password",
//       });
//     }

//     const user = users[0];

//     if (!user.password) {
//       return res.status(500).json({
//         message: "Password missing in database",
//       });
//     }

//     const isMatch = await bcrypt.compare(
//       password,
//       user.password
//     );

//     if (!isMatch) {
//       return res.status(401).json({
//         message: "Invalid email or password",
//       });
//     }

//     if (!process.env.JWT_SECRET) {
//       return res.status(500).json({
//         message: "JWT_SECRET is missing",
//       });
//     }

//     const token = jwt.sign(
//       {
//         id: user.id,
//         email: user.email,
//         role: user.role,
//       },
//       process.env.JWT_SECRET,
//       {
//         expiresIn: "7d",
//       }
//     );

//     return res.json({
//       message: "Login successful",
//       token,
//       user: {
//         id: user.id,
//         name: user.name,
//         email: user.email,
//         role: user.role,
//       },
//     });

//   } catch (err) {
//     console.error("LOGIN ERROR:", err);

//     return res.status(500).json({
//       message: err.message,
//     });
//   }
// };