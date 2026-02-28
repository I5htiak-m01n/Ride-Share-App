const express = require("express");
const cors = require("cors");
const { pool } = require("./db");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const ridesRoutes = require("./routes/rides");

const app = express(); 
app.use(cors({ // cors configuration to allow requests from frontend
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());

// Health check routes
app.get("/", (req, res) => res.json({
  message: "Ride Share API is running",
  version: "1.0.0",
  endpoints: {
    auth: "/api/auth",
    users: "/api/users",
    health: "/health/db"
  }
}));

app.get("/health/db", async (req, res) => {
  try {
    const r = await pool.query("SELECT now() as server_time");
    res.json({
      status: "healthy",
      database: "connected",
      server_time: r.rows[0].server_time
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: error.message
    });
  }
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/rides", ridesRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    message: `Cannot ${req.method} ${req.path}`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));