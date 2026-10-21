
import { Request, Response } from "express";
import { randomBytes } from "crypto";
import { isIP } from "net";
import pool from "../config/db";

// Check whether an IPv4 address belongs to a blocked range
function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b, c] = parts;

  return (
    a === 0 ||                         // Current network / unspecified
    a === 10 ||                        // Private
    a === 127 ||                       // Loopback
    (a === 100 && b >= 64 && b <= 127) || // Shared address space
    (a === 169 && b === 254) ||        // Link-local / metadata
    (a === 172 && b >= 16 && b <= 31) || // Private
    (a === 192 && b === 168) ||        // Private
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224                            // Multicast and reserved
  );
}

// Check IPv6 addresses that must not be webhook destinations
function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split("%")[0];

  // IPv4-mapped IPv6, for example ::ffff:127.0.0.1
  const mapped = normalized.match(
    /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/
  );

  if (mapped) {
    return isBlockedIPv4(mapped[1]);
  }

  // Handle IPv4-mapped addresses written in hexadecimal
  const mappedHex = normalized.match(
    /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/
  );

  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);

    const ipv4 = [
      high >> 8,
      high & 255,
      low >> 8,
      low & 255
    ].join(".");

    return isBlockedIPv4(ipv4);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff")
  );
}

// Validate URL syntax and reject obvious local/private destinations.
// DNS resolution must also be checked before making outbound requests.
function validateWebhookUrl(value: string): URL | null {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return null;
  }

  // Credentials in URLs are unnecessary and can obscure destinations.
  if (parsedUrl.username || parsedUrl.password) {
    return null;
  }

  // Reject fragments because they are not sent to the HTTP server.
  if (parsedUrl.hash) {
    return null;
  }

  const hostname = parsedUrl.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

  // Block local and commonly reserved internal hostnames.
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal"
  ) {
    return null;
  }

  const ipVersion = isIP(hostname);

  if (ipVersion === 4 && isBlockedIPv4(hostname)) {
    return null;
  }

  if (ipVersion === 6 && isBlockedIPv6(hostname)) {
    return null;
  }

  return parsedUrl;
}

// Create a new webhook endpoint
export async function createWebhook(
  req: Request,
  res: Response
) {
  try {
    const { url } = req.body;

    if (typeof url !== "string" || !url.trim()) {
      return res.status(400).json({
        error: "A destination URL is required."
      });
    }

    const parsedUrl = validateWebhookUrl(url.trim());

    if (!parsedUrl) {
      return res.status(400).json({
        error:
          "Invalid or unsafe destination URL. Use a valid HTTP or HTTPS URL pointing to a public destination."
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
