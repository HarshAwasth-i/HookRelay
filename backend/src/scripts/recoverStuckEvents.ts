
import pool from "../config/db";
import { webhookQueue } from "../queues/webhookQueue";

async function recoverStuckEvents() {
  try {
    // Find events that have been processing for more than 5 minutes
    const [rows] = await pool.execute(
      `SELECT id
       FROM events
       WHERE status = 'processing'
         AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)`
    );

    const events = rows as { id: number }[];

    for (const event of events) {
      // BullMQ job IDs default to generated IDs, so find the job
      // by its eventId instead of assuming a job ID.
      const waiting = await webhookQueue.getJobs(
        ["waiting", "delayed", "active"],
        0,
        -1
      );

      const matchingJob = waiting.find(
        (job) => job.data.eventId === event.id
      );

      if (matchingJob) {
        console.log(
          `Event ${event.id} still has a queue job in state ${await matchingJob.getState()}; skipping`
        );
        continue;
      }

      // No active or queued job was found. Reset the stale event.
      // We do not enqueue automatically in this first version.
      await pool.execute(
        `UPDATE events
         SET status = 'pending'
         WHERE id = ? AND status = 'processing'
           AND updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
        [event.id]
      );

      console.log(
        `Event ${event.id} reset to pending; manual requeue is required`
      );
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
