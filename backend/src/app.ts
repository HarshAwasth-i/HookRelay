
import express from "express";
import cors from "cors";

import webhookRoutes from "./routes/webhookRoutes";
import eventRoutes from "./routes/eventRoutes";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to HookRelay API",
    status: "running"
  });
});

// Health check route
app.get("/health", (req, res) => {
  res.json({
    status: "healthy"
  });
});

// Webhook endpoints
app.use("/api/webhooks", webhookRoutes);

// Event ingestion
app.use("/api/events", eventRoutes);

export default app;
