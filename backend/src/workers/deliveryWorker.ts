
import { Worker, Job } from "bullmq";
import { createHmac } from "crypto";
import pool from "../config/db";
import redisConnection from "../config/redis";

// Data received from the BullMQ queue
interface WebhookJobData {
  eventId: number;
}

// Create the background worker
const deliveryWorker = new Worker<WebhookJobData>(
  "webhook-delivery",
  async (job: Job<WebhookJobData>) => {
    const { eventId } = job.data;

    console.log(`Processing webhook event ${eventId}`);

    // Fetch the event, destination URL, and endpoint secret
    const [rows] = await pool.execute(
      `SELECT
         e.id,
         e.endpoint_id,
         e.event_type,
         e.payload,
         w.url,
         w.secret
       FROM events e
       JOIN webhook_endpoints w ON w.id = e.endpoint_id
       WHERE e.id = ?`,
      [eventId]
    );

    const events = rows as {
      id: number;
      endpoint_id: number;
      event_type: string;
      payload: unknown;
      url: string;
      secret: string;
    }[];

    if (events.length === 0) {
      throw new Error(`Event ${eventId} was not found`);
    }

    const event = events[0];

    // Convert the stored payload into an object if necessary
    const payload =
      typeof event.payload === "string"
        ? JSON.parse(event.payload)
        : event.payload;

    // Serialize once so the signed content matches the sent body
    const payloadString = JSON.stringify(payload);

    // Generate an HMAC-SHA256 signature using the endpoint secret
    const signature = createHmac("sha256", event.secret)
      .update(payloadString)
      .digest("hex");

    // Mark the event as processing
    await pool.execute(
      `UPDATE events SET status = 'processing' WHERE id = ?`,
      [eventId]
    );

    // Track the destination response for delivery_attempts
    let responseStatus: number | null = null;

    try {
      // Send the signed webhook HTTP request
      const response = await fetch(event.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-HookRelay-Event": event.event_type,
          "X-HookRelay-Event-Id": String(event.id),
          "X-HookRelay-Signature": `sha256=${signature}`
        },
        body: payloadString,
        signal: AbortSignal.timeout(10000)
      });

      responseStatus = response.status;

      // Treat non-2xx responses as failed deliveries
      if (!response.ok) {
        throw new Error(
          `Destination returned HTTP ${response.status}`
        );
      }

      // Record the successful attempt
      await pool.execute(
        `INSERT INTO delivery_attempts
         (event_id, attempt_number, response_status, error_message)
         VALUES (?, ?, ?, ?)`,
        [eventId, job.attemptsMade + 1, responseStatus, null]
      );

      // Mark the event as successfully delivered
      await pool.execute(
        `UPDATE events SET status = 'success' WHERE id = ?`,
        [eventId]
      );

      console.log(`Event ${eventId} delivered successfully`);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown delivery error";

      // Record the failed attempt
      await pool.execute(
        `INSERT INTO delivery_attempts
         (event_id, attempt_number, response_status, error_message)
         VALUES (?, ?, ?, ?)`,
        [
          eventId,
          job.attemptsMade + 1,
          responseStatus,
          errorMessage
        ]
      );

      // Keep the event pending while retries remain.
      // Mark it failed only after the final attempt.
      const isFinalAttempt =
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      await pool.execute(
        `UPDATE events SET status = ? WHERE id = ?`,
        [isFinalAttempt ? "failed" : "pending", eventId]
      );

      console.error(
        `Event ${eventId} delivery failed: ${errorMessage}`
      );

      // Re-throw so BullMQ can perform configured retries
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5
  }
);

// Log worker events
deliveryWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

deliveryWorker.on("failed", (job, error) => {
  console.error(`Job ${job?.id} failed: ${error.message}`);
});

console.log("HookRelay delivery worker started");

export default deliveryWorker;
