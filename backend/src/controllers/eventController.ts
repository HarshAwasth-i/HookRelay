
import { Request, Response } from "express";
import pool from "../config/db";

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

    // Check whether the destination exists and is active
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

    // Store the event in MySQL
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

    return res.status(201).json({
      message: "Event created successfully.",
      event: {
        id: insertResult.insertId,
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
