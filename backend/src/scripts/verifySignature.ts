import { createHmac, timingSafeEqual } from "crypto";
import pool from "../config/db";

async function verifySignature() {
  try {
    const endpointId = 3;

    const payload = {
      test: true,
      message: "Testing HMAC signatures"
    };

    const [rows] = await pool.execute(
      `SELECT secret
       FROM webhook_endpoints
       WHERE id = ? AND is_active = TRUE`,
      [endpointId]
    );

    const endpoints = rows as { secret: string }[];

    if (endpoints.length === 0) {
      throw new Error("Active webhook endpoint not found.");
    }

    const secret = endpoints[0].secret;

    const payloadString = JSON.stringify(payload);

    const expectedSignature = createHmac("sha256", secret)
      .update(payloadString)
      .digest("hex");

    const receivedSignature = "3910cc5e624b61a5d3e8a416167b887b88873b20c4f4a241dc30bf8f6e86a411";

    if (!/^[a-f0-9]{64}$/i.test(receivedSignature)) {
      throw new Error(
        "Replace PASTE_SIGNATURE_HEX_HERE with the 64-character signature."
      );
    }

    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const receivedBuffer = Buffer.from(receivedSignature, "hex");

    const isValid =
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer);

    console.log(
      isValid
        ? "Signature verified successfully!"
        : "Signature verification failed."
    );
  } catch (error) {
    console.error(
      "Verification error:",
      error instanceof Error ? error.message : error
    );
  } finally {
    await pool.end();
  }
}

verifySignature();
