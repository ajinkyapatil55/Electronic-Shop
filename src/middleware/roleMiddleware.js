// src/middleware/roleMiddleware.js

const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        // Check if user exists (set by authMiddleware) and has the right role
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            console.error(`Access Denied: Role '${req.user?.role}' not authorized.`);
            return res.status(403).json({ 
                success: false, 
                message: "Access Denied: You do not have permission to perform this action." 
            });
        }
        next();
    };
};

module.exports = authorizeRoles;