const cron = require("node-cron");

function startScheduler(pool) {
  // Run every 60 seconds: activate scheduled rides and expire stale requests
  cron.schedule("* * * * *", async () => {
    try {
      // 1. Activate scheduled rides that are within 20 minutes of pickup
      const activated = await pool.query(
        `UPDATE ride_requests
         SET status = 'open',
             expires_at = scheduled_time + INTERVAL '5 minutes'
         WHERE status = 'scheduled'
           AND scheduled_time <= NOW() + INTERVAL '20 minutes'
         RETURNING request_id, rider_id, scheduled_time`
      );

      // Send notifications for each activated ride
      for (const row of activated.rows) {
        const timeStr = new Date(row.scheduled_time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        await pool.query(
          `INSERT INTO notifications (user_id, title, body)
           VALUES ($1, 'Scheduled Ride Activated',
                   $2)`,
          [
            row.rider_id,
            `Your scheduled ride for ${timeStr} is now being matched with nearby drivers.`,
          ]
        );
      }

      if (activated.rows.length > 0) {
        console.log(
          `[Scheduler] Activated ${activated.rows.length} scheduled ride(s)`
        );
      }

      // 2. Expire stale open requests
      const expired = await pool.query(
        `SELECT auto_expire_ride_requests() AS expired_count`
      );
      const expiredCount = expired.rows[0]?.expired_count || 0;
      if (expiredCount > 0) {
        console.log(
          `[Scheduler] Expired ${expiredCount} stale ride request(s)`
        );
      }
    } catch (err) {
      console.error("[Scheduler] Error:", err.message);
    }
  });

  console.log("[Scheduler] Started — checking every 60s");
}

module.exports = { startScheduler };
