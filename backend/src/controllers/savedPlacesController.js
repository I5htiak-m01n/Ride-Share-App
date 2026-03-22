const { pool } = require("../db");

const MAX_SAVED_PLACES = 10;

// GET /api/saved-places
const getSavedPlaces = async (req, res) => {
  const riderId = req.user.id;
  try {
    const { rows } = await pool.query(
      `SELECT place_id, label, address,
              ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng,
              created_at
         FROM rider_saved_places
        WHERE rider_id = $1
        ORDER BY created_at`,
      [riderId]
    );
    res.json({ places: rows });
  } catch (err) {
    console.error("getSavedPlaces error:", err);
    res.status(500).json({ error: "Failed to fetch saved places" });
  }
};

// POST /api/saved-places
const createSavedPlace = async (req, res) => {
  const riderId = req.user.id;
  const { label, address, lat, lng } = req.body;

  if (!label || !address || lat == null || lng == null) {
    return res.status(400).json({ error: "label, address, lat, and lng are required" });
  }

  try {
    // Check limit
    const { rows: countRows } = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM rider_saved_places WHERE rider_id = $1",
      [riderId]
    );
    if (countRows[0].cnt >= MAX_SAVED_PLACES) {
      return res.status(400).json({ error: `Maximum ${MAX_SAVED_PLACES} saved places allowed` });
    }

    const { rows } = await pool.query(
      `INSERT INTO rider_saved_places (rider_id, label, address, location)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326))
       RETURNING place_id, label, address,
                 ST_Y(location::geometry) AS lat,
                 ST_X(location::geometry) AS lng,
                 created_at`,
      [riderId, label.trim(), address.trim(), lng, lat]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: `A place named "${label}" already exists` });
    }
    console.error("createSavedPlace error:", err);
    res.status(500).json({ error: "Failed to save place" });
  }
};

// PUT /api/saved-places/:placeId
const updateSavedPlace = async (req, res) => {
  const riderId = req.user.id;
  const { placeId } = req.params;
  const { label, address, lat, lng } = req.body;

  if (!label && !address && lat == null && lng == null) {
    return res.status(400).json({ error: "At least one field to update is required" });
  }

  try {
    // Build dynamic update
    const sets = [];
    const vals = [placeId, riderId];
    let idx = 3;

    if (label) { sets.push(`label = $${idx++}`); vals.push(label.trim()); }
    if (address) { sets.push(`address = $${idx++}`); vals.push(address.trim()); }
    if (lat != null && lng != null) {
      sets.push(`location = ST_SetSRID(ST_MakePoint($${idx}, $${idx + 1}), 4326)`);
      vals.push(lng, lat);
      idx += 2;
    }

    const { rows } = await pool.query(
      `UPDATE rider_saved_places
          SET ${sets.join(", ")}
        WHERE place_id = $1 AND rider_id = $2
        RETURNING place_id, label, address,
                  ST_Y(location::geometry) AS lat,
                  ST_X(location::geometry) AS lng,
                  created_at`,
      vals
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Saved place not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: `A place with that name already exists` });
    }
    console.error("updateSavedPlace error:", err);
    res.status(500).json({ error: "Failed to update saved place" });
  }
};

// DELETE /api/saved-places/:placeId
const deleteSavedPlace = async (req, res) => {
  const riderId = req.user.id;
  const { placeId } = req.params;

  try {
    const { rowCount } = await pool.query(
      "DELETE FROM rider_saved_places WHERE place_id = $1 AND rider_id = $2",
      [placeId, riderId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Saved place not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("deleteSavedPlace error:", err);
    res.status(500).json({ error: "Failed to delete saved place" });
  }
};

module.exports = { getSavedPlaces, createSavedPlace, updateSavedPlace, deleteSavedPlace };
