const { supabase } = require("../supabaseClient");

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({
        error: "Access denied. Authentication required."
      });
    }

    // Get role from user metadata or database
    const userRole = req.user.user_metadata?.role || req.user.role;

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: "Access denied. Insufficient permissions."
      });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRoles,
};
