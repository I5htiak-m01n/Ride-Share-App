const express = require("express");
const { pool } = require("./db");

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("Backend is running ✅"));

app.get("/health/db", async (req, res) => {
  const r = await pool.query("SELECT now() as server_time");
  res.json(r.rows[0]);
});

app.get("/users", async (req, res) => {
  const r = await pool.query("SELECT user_id, first_name, last_name, role, phone_number, created_at FROM users ORDER BY user_id");
  res.json(r.rows);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));