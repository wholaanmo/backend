const { verify } = require ("jsonwebtoken");
const { isTokenValid } = require("../api/users/user.service");

module.exports = {
    checkToken: async (req, res, next) => {
        let token = req.get("authorization");
        if (!token) {
            return res.status(401).json({
                success: 0,
                message: "Access denied! No token provided"
            });
        }

        if (!token.startsWith('Bearer ')) {
            return res.status(401).json({
                success: 0,
                message: "Invalid token format"
            });
        }

        token = token.slice(7);

        try {
            // Verify token synchronously first
            const decoded = verify(token, "qwe1234");
            console.log("Decoded token payload:", decoded);

            // Then check if token is invalidated in DB
            const isValid = await isTokenValid(decoded.userId);
            if (!isValid) {
                return res.status(401).json({
                    success: 0,
                    message: "Session expired. Please login again."
                });
            }
            
            // Attach user to request
            req.user = decoded;
            next();
        } catch (err) {
            console.error("Token validation error:", err);
            
            let message = "Invalid token";
            if (err.name === 'TokenExpiredError') {
                message = "Token expired. Please login again.";
            } else if (err.name === 'JsonWebTokenError') {
                message = "Malformed token";
            }

            return res.status(401).json({
                success: 0,
                message: message
            });
        }
    }
};