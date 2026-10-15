
import { Request, Response } from "express";
import { randomBytes } from "crypto";
import pool from "../config/db";

// Create a new webhook endpoint
export async function createWebhook(
  req: Request,
  res: Response
) {
  try {
    const { url } = req.body;

    // Validate the URL field
    if (typeof url !== "string" || !url.trim()) {
      return res.status(400).json({
        error: "A destination URL is required."
      });
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({
        error: "Please provide a valid URL."
      });
    }

    // Allow only HTTP and HTTPS URLs
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        error: "Only HTTP and HTTPS URLs are allowed."
      });
    }

    // Generate a secure secret for webhook signatures
    const secret = randomBytes(32).toString("hex");

    // Save the endpoint in MySQL
    const [result] = await pool.execute(
      `INSERT INTO webhook_endpoints (url, secret)
       VALUES (?, ?)`,
      [parsedUrl.toString(), secret]
    );

    const insertResult = result as { insertId: number };

    return res.status(201).json({
      message: "Webhook endpoint created successfully.",
      endpoint: {
        id: insertResult.insertId,
        url: parsedUrl.toString(),
        secret,
        is_active: true
      }
    });
  } catch (error) {
    console.error("Create webhook error:", error);

    return res.status(500).json({
      error: "Internal server error."
    });
  }
}

// Get all registered webhook endpoints
export async function getWebhooks(
  req: Request,
  res: Response
) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, url, is_active, created_at
       FROM webhook_endpoints
       ORDER BY created_at DESC`
    );

    const webhooks = rows as object[];

    return res.status(200).json({
      count: webhooks.length,
      webhooks
    });
  } catch (error) {
    console.error("Get webhooks error:", error);

    return res.status(500).json({
      error: "Internal server error."
    });
  }
}
