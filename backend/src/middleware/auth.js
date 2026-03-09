const jwt = require("jsonwebtoken");
const { pool } = require("../db");

const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    // Verify JWT signature and expiration using our own secret
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch user role from database to ensure it's current
    const dbResult = await pool.query(
      "SELECT user_id, email, name, role FROM users WHERE user_id = $1",
      [decoded.user_id]
    );

    if (dbResult.rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    // Attach user info to request
    // Use 'id' as alias for user_id to maintain compatibility with existing controllers
    const dbUser = dbResult.rows[0];
    req.user = {
      id: dbUser.user_id,
      user_id: dbUser.user_id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      dbRole: dbUser.role,
    };
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    console.error("Token verification error:", error);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({
        error: "Access denied. Authentication required."
      });
    }

    const userRole = req.user.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: "Access denied. Insufficient permissions.",
        detail: `Role '${userRole || 'none'}' is not in allowed roles [${allowedRoles.join(', ')}]`
      });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRoles,
};
