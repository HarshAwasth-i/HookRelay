
import { Queue } from "bullmq";
import redisConnection from "../config/redis";

export const webhookQueue = new Queue("webhook-delivery", {
  connection: redisConnection,
});
