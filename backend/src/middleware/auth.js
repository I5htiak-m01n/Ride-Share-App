const { supabase, supabaseAdmin } = require("../supabaseClient");
const { pool } = require("../db");

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    // Use admin client for token verification (has persistSession: false,
    // so it won't be affected by login/logout calls on the shared client)
    const verifier = supabaseAdmin || supabase;
    const { data: { user }, error } = await verifier.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Fetch the actual role from the database (user_metadata.role can be missing)
    let dbResult = await pool.query(
      "SELECT role FROM users WHERE user_id = $1",
      [user.id]
    );

    // If users row is missing, recover it from Supabase auth metadata
    // This can happen if the DB was reset but Supabase Auth users persist
    if (dbResult.rows.length === 0) {
      console.warn("Users row missing for", user.id, "— auto-recovering in middleware");
      const meta = user.user_metadata || {};
      const recoveredRole = meta.role || 'rider';
      const recoveredName = meta.name
        || (meta.first_name ? `${meta.first_name} ${meta.last_name || ''}`.trim() : 'Unknown User');
      try {
        await pool.query(
          `INSERT INTO users (user_id, email, name, phone_number, role)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id) DO NOTHING`,
          [user.id, user.email, recoveredName, meta.phone_number || '', recoveredRole]
        );
        dbResult = await pool.query(
          "SELECT role FROM users WHERE user_id = $1",
          [user.id]
        );
      } catch (recoveryErr) {
        console.warn("User row auto-recovery failed:", recoveryErr.message);
      }
    }

    const dbRole = dbResult.rows[0]?.role;

    // Attach user to request with reliable role
    req.user = user;
    req.user.dbRole = dbRole || user.user_metadata?.role || null;
    next();
  } catch (error) {
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

    // Check database role first, then user_metadata, then Supabase role
    const userRole = req.user.dbRole || req.user.user_metadata?.role;

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
