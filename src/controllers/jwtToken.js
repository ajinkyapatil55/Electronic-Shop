const authService = require("../services/authService");

exports.login = async (req, res) => {
  try {
    const result = await authService.login(
      req.body.email,
      req.body.password
    );

    res.json(result);
  } catch (err) {
    res.status(401).json({
      message: err.message,
    });
  }
};