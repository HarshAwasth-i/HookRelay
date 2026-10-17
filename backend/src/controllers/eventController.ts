
import { Request, Response } from "express";
import pool from "../config/db";
import { webhookQueue } from "../queues/webhookQueue";

// Create a new event
export async function createEvent(
  req: Request,
  res: Response
) {
  try {
    const { endpoint_id, event_type, payload } = req.body;

    // Validate endpoint_id
    if (
      !Number.isSafeInteger(endpoint_id) ||
      endpoint_id <= 0
    ) {
      return res.status(400).json({
        error: "A valid endpoint_id is required."
      });
    }

    // Validate event_type
    if (
      typeof event_type !== "string" ||
      !event_type.trim()
    ) {
      return res.status(400).json({
        error: "A valid event_type is required."
      });
    }

    // Validate payload
    if (
      payload === null ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    ) {
      return res.status(400).json({
        error: "Payload must be a JSON object."
      });
    }

    // Check whether the endpoint exists and is active
    const [endpoints] = await pool.execute(
      `SELECT id
       FROM webhook_endpoints
       WHERE id = ? AND is_active = TRUE`,
      [endpoint_id]
    );

    if ((endpoints as object[]).length === 0) {
      return res.status(404).json({
        error: "Webhook endpoint not found or inactive."
      });
    }

    // Insert the event into MySQL
    const [result] = await pool.execute(
      `INSERT INTO events
       (endpoint_id, event_type, payload, status)
       VALUES (?, ?, ?, 'pending')`,
      [
        endpoint_id,
        event_type.trim(),
        JSON.stringify(payload)
      ]
    );

    const insertResult = result as { insertId: number };
    const eventId = insertResult.insertId;

    // Add the event to the BullMQ delivery queue
    await webhookQueue.add("deliver-webhook", {
      eventId
    });

    // Return the created event
    return res.status(201).json({
      message: "Event created and queued successfully.",
      event: {
        id: eventId,
        endpoint_id,
        event_type: event_type.trim(),
        payload,
        status: "pending"
      }
    });
  } catch (error) {
    console.error("Create event error:", error);

    return res.status(500).json({
      error: "Internal server error."
    });
  }
}

// Get a single event by ID
export async function getEventById(
  req: Request,
  res: Response
) {
  try {
    const id = Number(req.params.id);

    // Validate the event ID
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "A valid event ID is required."
      });
    }

    // Fetch the event from MySQL
    const [rows] = await pool.execute(
      `SELECT
         id,
         endpoint_id,
         event_type,
         payload,
         status,
         created_at
       FROM events
       WHERE id = ?`,
      [id]
    );

    const events = rows as {
      id: number;
      endpoint_id: number;
      event_type: string;
      payload: unknown;
      status: string;
      created_at: Date;
    }[];

    // Handle an event that does not exist
    if (events.length === 0) {
      return res.status(404).json({
        error: "Event not found."
      });
    }

    const event = events[0];

    // Return the event details
    return res.status(200).json({
      event: {
        ...event,
        payload:
          typeof event.payload === "string"
            ? JSON.parse(event.payload)
            : event.payload
      }
    });
  } catch (error) {
    console.error("Get event error:", error);

    return res.status(500).json({
      error: "Internal server error."
    });
  }
}

// Get events with pagination
export async function getEvents(
  req: Request,
  res: Response
) {
  try {
    // Read pagination parameters from the URL
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    // Validate pagination parameters
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        error:
          "Page must be positive and limit must be between 1 and 100."
      });
    }

    // Calculate how many records to skip
    const offset = (page - 1) * limit;

    // Fetch the requested page
    const [rows] = await pool.execute(
      `SELECT
         id,
         endpoint_id,
         event_type,
         payload,
         status,
         created_at
       FROM events
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Count all events for pagination metadata
    const [countRows] = await pool.execute(
      "SELECT COUNT(*) AS total FROM events"
    );

    const countResult = countRows as {
      total: number | string;
    }[];

    const total = Number(countResult[0].total);

    return res.status(200).json({
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      events: rows
    });
  } catch (error) {
    console.error("Get events error:", error);

    return res.status(500).json({
      error: "Internal server error."
    });
  }
}
