
import { Queue } from "bullmq";
import redisConnection from "../config/redis";

export const webhookQueue = new Queue("webhook-delivery", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000
    },
    removeOnComplete: 1000,
    removeOnFail: false
  }
});
