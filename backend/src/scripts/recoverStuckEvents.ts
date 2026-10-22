
import pool from "../config/db";
import { webhookQueue } from "../queues/webhookQueue";

async function recoverStuckEvents() {
  try {
    const [rows] = await pool.execute(
      `SELECT id
       FROM events
       WHERE status = 'processing'
         AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)`
    );

    const events = rows as { id: number }[];

    if (events.length === 0) {
      console.log("No stale processing events found.");
      return;
    }

    for (const event of events) {
      // Find existing jobs that might still deliver this event.
      const jobs = await webhookQueue.getJobs(
        ["waiting", "delayed", "active"],
        0,
        -1
      );

      const matchingJob = jobs.find(
        (job) => Number(job.data.eventId) === event.id
      );

      if (matchingJob) {
        console.log(
          `Event ${event.id} already has a ${await matchingJob.getState()} job; skipping.`
        );
        continue;
      }

      // Atomically claim the stale event for recovery.
      const [updateResult] = await pool.execute(
        `UPDATE events
         SET status = 'pending'
         WHERE id = ?
           AND status = 'processing'
           AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
        [event.id]
      );

      const result = updateResult as { affectedRows: number };

      if (result.affectedRows === 0) {
        console.log(
          `Event ${event.id} changed during recovery; skipping.`
        );
        continue;
      }

      try {
        await webhookQueue.add("deliver-webhook", {
          eventId: event.id
        });

        console.log(`Event ${event.id} requeued for delivery.`);
      } catch (error) {
        console.error(
          `Failed to requeue event ${event.id}:`,
          error
        );

        // Leave it pending so a later recovery run can retry.
      }
    }
  } catch (error) {
    console.error("Stuck event recovery failed:", error);
    process.exitCode = 1;
  } finally {
    await webhookQueue.close();
    await pool.end();
  }
}

recoverStuckEvents();
