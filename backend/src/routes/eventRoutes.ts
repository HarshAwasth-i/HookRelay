
import { Router } from "express";
import { createEvent } from "../controllers/eventController";

const router = Router();

// POST /api/events - Create a new event
router.post("/", createEvent);

export default router;
