const { supabase, supabaseAdmin } = require("../supabaseClient");
const { pool } = require("../db");

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

    if (!["rider", "driver", "mixed"].includes(role)) {
      return res.status(400).json({
        error: "Invalid role. Must be 'rider', 'driver', or 'mixed'"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters long"
      });
    }

    // Create user in Supabase Auth
    // Admin client bypasses rate limits and auto-confirms email
    let authData, authError;

    if (supabaseAdmin) {
      const result = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_name, last_name, name: `${first_name} ${last_name}`, role, phone_number }
      });
      authData = result.data;
      authError = result.error;
    } else {
      // Fallback if service role key is not set (subject to rate limits)
      const result = await supabase.auth.signUp({
        email,
        password,
        options: { data: { first_name, last_name, name: `${first_name} ${last_name}`, role, phone_number } }
      });
      authData = result.data;
      authError = result.error;
    }

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    if (!authData.user) {
      return res.status(500).json({ error: "Failed to create user" });
    }

    const userId = authData.user.id;

    await client.query("BEGIN");

    // Insert user into public.users
    await client.query(
      `INSERT INTO users (user_id, email, name, phone_number, role)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO NOTHING`,
      [userId, email, `${first_name} ${last_name}`, phone_number, role]
    );

    // Create rider profile
    if (role === "rider" || role === "mixed") {
      await client.query(
        "INSERT INTO riders (rider_id) VALUES ($1) ON CONFLICT DO NOTHING",
        [userId]
      );
    }

    // Create driver profile with temporary license number
    if (role === "driver" || role === "mixed") {
      await client.query(
        "INSERT INTO drivers (driver_id, license_number, status) VALUES ($1, $2, 'offline') ON CONFLICT DO NOTHING",
        [userId, `PENDING_${userId.substring(0, 8)}`]
      );
    }

    // Create wallet
    await client.query(
      "INSERT INTO wallets (owner_id, balance, currency) VALUES ($1, 0, 'BDT') ON CONFLICT DO NOTHING",
      [userId]
    );

    await client.query("COMMIT");

    // Sign in immediately to return a usable session
    const { data: sessionData } = await supabase.auth.signInWithPassword({ email, password });

    res.status(201).json({
      message: "User registered successfully",
      user: { user_id: userId, email, name: `${first_name} ${last_name}`, role, phone_number },
      session: sessionData?.session || null,
      access_token: sessionData?.session?.access_token || null,
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
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required"
      });
    }

    // Sign in with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        error: error.message
      });
    }

    if (!data.user || !data.session) {
      return res.status(401).json({
        error: "Invalid credentials"
      });
    }

    // Get user details from database
    const userResult = await pool.query(
      `SELECT user_id, name, email, role, phone_number, created_at
       FROM users
       WHERE user_id = $1`,
      [data.user.id]
    );

    // Ensure wallet exists for user (may not exist if trigger failed during registration)
    try {
      await pool.query(
        "INSERT INTO wallets (owner_id, balance, currency) VALUES ($1, 0, 'BDT') ON CONFLICT DO NOTHING",
        [data.user.id]
      );
    } catch (walletError) {
      console.warn("Wallet creation on login failed:", walletError.message);
    }

    // Log login activity
    await pool.query(
      "INSERT INTO login_logs (user_id) VALUES ($1)",
      [data.user.id]
    );

    res.json({
      message: "Login successful",
      user: userResult.rows[0] || {
        user_id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role || "rider",
      },
      session: data.session,
      access_token: data.session.access_token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Internal server error during login"
    });
  }
};

const getProfile = async (req, res) => {
  try {
    // req.user comes from authenticateToken middleware (contains Supabase user)
    const userResult = await pool.query(
      `SELECT user_id, name, email, phone_number, role, avatar_url, created_at
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
    // Don't call supabase.auth.signOut() on the server —
    // it mutates the shared server-side client's session state,
    // which can break token verification for other users.
    // Logout is handled client-side by clearing localStorage.
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  logout,
};
