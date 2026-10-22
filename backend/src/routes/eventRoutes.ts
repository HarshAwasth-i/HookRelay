
import { Router } from "express";

import {
  createEvent,
  getEventById,
  getEvents,
  getEventAttempts
} from "../controllers/eventController";

const router = Router();

// POST /api/events - Create an event
router.post("/", createEvent);

// GET /api/events - List events with pagination
router.get("/", getEvents);

// GET /api/events/:id/attempts - Get delivery history
router.get("/:id/attempts", getEventAttempts);

// GET /api/events/:id - Retrieve one event
router.get("/:id", getEventById);

export default router;
