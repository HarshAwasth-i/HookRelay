import { Router } from "express";
import {
  createEvent,
  getEventById,
  getEvents,
  getEventAttempts
} from "../controllers/eventController";

const router = Router();
router.post("/", createEvent);
router.get("/", getEvents);
router.get("/:id/attempts", getEventAttempts);
router.get("/:id", getEventById);

export default router;
