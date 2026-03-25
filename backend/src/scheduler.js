const cron = require("node-cron");

function startScheduler(pool) {
  // Run every 60 seconds: activate scheduled rides and expire stale requests
  cron.schedule("* * * * *", async () => {
    // 1. Activate scheduled rides + send notifications (transactional)
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const activated = await client.query(
        `UPDATE ride_requests
         SET status = 'open',
             expires_at = scheduled_time + INTERVAL '5 minutes'
         WHERE status = 'scheduled'
           AND scheduled_time <= NOW() + INTERVAL '20 minutes'
         RETURNING request_id, rider_id, scheduled_time`
      );

      for (const row of activated.rows) {
        const timeStr = new Date(row.scheduled_time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        await client.query(
          `INSERT INTO notifications (user_id, title, body)
           VALUES ($1, 'Scheduled Ride Activated', $2)`,
          [
            row.rider_id,
            `Your scheduled ride for ${timeStr} is now being matched with nearby drivers.`,
          ]
        );
      }

      await client.query("COMMIT");

      if (activated.rows.length > 0) {
        console.log(
          `[Scheduler] Activated ${activated.rows.length} scheduled ride(s)`
        );
      }
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[Scheduler] Activation error:", err.message);
    } finally {
      client.release();
    }

    // 2. Expire stale open requests (independent operation)
    try {
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
      console.error("[Scheduler] Expiry error:", err.message);
    }
  });

  console.log("[Scheduler] Started — checking every 60s");
}

module.exports = { startScheduler };
