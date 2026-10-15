
import { Router } from "express";

import {
  createWebhook,
  getWebhooks
} from "../controllers/webhookController";

const router = Router();

// POST /api/webhooks - Create a webhook endpoint
router.post("/", createWebhook);

// GET /api/webhooks - Get all webhook endpoints
router.get("/", getWebhooks);

export default router;
