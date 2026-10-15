
import { Router } from "express";

import {
  createEvent,
  getEventById
} from "../controllers/eventController";

const router = Router();

// POST /api/events - Create a new event
router.post("/", createEvent);

// GET /api/events/:id - Get an event by ID
router.get("/:id", getEventById);

export default router;
