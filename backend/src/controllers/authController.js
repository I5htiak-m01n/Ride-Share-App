const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const ACCESS_TOKEN_EXPIRY = parseInt(process.env.ACCESS_TOKEN_EXPIRY) || 3600; // 1 hour
const REFRESH_TOKEN_EXPIRY = parseInt(process.env.REFRESH_TOKEN_EXPIRY) || 604800; // 7 days
const BCRYPT_SALT_ROUNDS = 10;

// Helper: generate access token
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      user_id: user.user_id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

// Helper: generate refresh token
const generateRefreshToken = (user) => {
  return jwt.sign(
    { user_id: user.user_id },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

const register = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      email,
      password,
      first_name,
      last_name,
      phone_number,
      role = "rider",
    } = req.body;

    // Validation
    if (!email || !password || !first_name || !last_name || !phone_number) {
      return res.status(400).json({
        error: "Missing required fields: email, password, first_name, last_name, phone_number"
      });
    }

    if (!["rider", "driver"].includes(role)) {
      return res.status(400).json({
        error: "Invalid role. Must be 'rider' or 'driver'"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters long"
      });
    }

    // Check if email already exists
    const existingUser = await pool.query(
      "SELECT user_id FROM users WHERE email = $1",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Check if phone number already exists
    const existingPhone = await pool.query(
      "SELECT user_id FROM users WHERE phone_number = $1",
      [phone_number]
    );
    if (existingPhone.rows.length > 0) {
      return res.status(400).json({ error: "Phone number already registered" });
    }

    // Hash password using bcrypt
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    await client.query("BEGIN");

    // Insert user into public.users with hashed password
    const userResult = await client.query(
      `INSERT INTO users (email, first_name, last_name, password_hash, phone_number, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id, email, first_name, last_name, role, phone_number, created_at`,
      [email, first_name, last_name, passwordHash, phone_number, role]
    );

    const newUser = userResult.rows[0];

    // Create rider profile
    if (role === "rider") {
      await client.query(
        "INSERT INTO riders (rider_id) VALUES ($1) ON CONFLICT DO NOTHING",
        [newUser.user_id]
      );
    }

    // Create driver profile with temporary license number
    if (role === "driver") {
      await client.query(
        "INSERT INTO drivers (driver_id, license_number, status) VALUES ($1, $2, 'offline') ON CONFLICT DO NOTHING",
        [newUser.user_id, `PENDING_${newUser.user_id.substring(0, 8)}`]
      );
    }

    // Create wallet
    await client.query(
      "INSERT INTO wallets (owner_id, balance, currency) VALUES ($1, 0, 'BDT') ON CONFLICT DO NOTHING",
      [newUser.user_id]
    );

    // Generate JWT tokens
    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    // Store refresh token in database
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_TOKEN_EXPIRY} seconds')`,
      [newUser.user_id, refreshToken]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "User registered successfully",
      user: {
        user_id: newUser.user_id,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        name: `${newUser.first_name} ${newUser.last_name}`,
        role: newUser.role,
        phone_number: newUser.phone_number,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Registration error:", error);
    res.status(500).json({
      error: "Internal server error during registration",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

const login = async (req, res) => {
  const client = await pool.connect();

  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required"
      });
    }

    await client.query("BEGIN");

    // Query user by email (including password hash)
    const userResult = await client.query(
      `SELECT user_id, first_name, last_name, email, password_hash, role, phone_number, created_at
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = userResult.rows[0];

    // Verify password using bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      await client.query("ROLLBACK");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Ensure wallet exists
    await client.query(
      "INSERT INTO wallets (owner_id, balance, currency) VALUES ($1, 0, 'BDT') ON CONFLICT DO NOTHING",
      [user.user_id]
    );

    // Ensure rider/driver row exists
    if (user.role === "rider" || user.role === "mixed") {
      await client.query(
        "INSERT INTO riders (rider_id) VALUES ($1) ON CONFLICT DO NOTHING",
        [user.user_id]
      );
    }
    if (user.role === "driver" || user.role === "mixed") {
      await client.query(
        "INSERT INTO drivers (driver_id, license_number, status) VALUES ($1, $2, 'offline') ON CONFLICT DO NOTHING",
        [user.user_id, `PENDING_${user.user_id.substring(0, 8)}`]
      );
    }

    // Generate JWT tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in database
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_TOKEN_EXPIRY} seconds')`,
      [user.user_id, refreshToken]
    );

    // Log login activity
    await client.query(
      "INSERT INTO login_logs (user_id) VALUES ($1)",
      [user.user_id]
    );

    await client.query("COMMIT");

    res.json({
      message: "Login successful",
      user: {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        name: `${user.first_name} ${user.last_name}`,
        role: user.role,
        phone_number: user.phone_number,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Login error:", error);
    res.status(500).json({
      error: "Internal server error during login"
    });
  } finally {
    client.release();
  }
};

const getProfile = async (req, res) => {
  try {
    // req.user comes from authenticateToken middleware
    const userResult = await pool.query(
      `SELECT user_id, first_name, last_name, email, phone_number, role, avatar_url, created_at
       FROM users
       WHERE user_id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Get wallet info
    const walletResult = await pool.query(
      "SELECT balance, currency FROM wallets WHERE owner_id = $1",
      [req.user.id]
    );

    const profile = {
      ...user,
      name: `${user.first_name} ${user.last_name}`,
      wallet: walletResult.rows[0] || null,
    };

    res.json(profile);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
};

const logout = async (req, res) => {
  try {
    // Revoke all refresh tokens for this user
    await pool.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
      [req.user.id]
    );

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ error: "refresh_token is required" });
    }

    // Verify the refresh token signature and expiration
    let decoded;
    try {
      decoded = jwt.verify(refresh_token, REFRESH_TOKEN_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired refresh token. Please log in again." });
    }

    // Check if token exists in database and is not revoked
    const tokenResult = await pool.query(
      `SELECT token_id, user_id FROM refresh_tokens
       WHERE token = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
      [refresh_token, decoded.user_id]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({ error: "Refresh token has been revoked or expired. Please log in again." });
    }

    // Get current user data
    const userResult = await pool.query(
      "SELECT user_id, email, role FROM users WHERE user_id = $1",
      [decoded.user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Generate new access token
    const newAccessToken = generateAccessToken(user);

    // Rotate refresh token: revoke old one and issue new one
    const newRefreshToken = generateRefreshToken(user);

    await pool.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token = $1",
      [refresh_token]
    );

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_TOKEN_EXPIRY} seconds')`,
      [user.user_id, newRefreshToken]
    );

    res.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({ error: "Internal server error during token refresh" });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  logout,
  refreshToken,
};
