import { redisClient } from "../../infrastructure/redis/redis.client.js";
import { AppError } from "../error-handlers/error.class.js";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_LIFETIME_MS = 60 * 60 * 1000; // 1 hour
const SLIDE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes (50% of idle timeout)

/**
 * Middleware to protect routes and slide session expiration based on timestamps.
 */
export const requireAuth = async (req, res, next) => {
  const sessionId = req.cookies?.sessionId || req.headers["x-session-id"];

  if (!sessionId) {
    throw new AppError("Unauthorized access. Please log in.", 401, "UNAUTHORIZED");
  }

  const sessionKey = `session:${sessionId}`;
  const sessionData = await redisClient.get(sessionKey);

  if (!sessionData) {
    throw new AppError("Session expired or invalid.", 401, "SESSION_EXPIRED");
  }

  const session = typeof sessionData === "string" ? JSON.parse(sessionData) : sessionData;
  const currentTime = Date.now();

  // 1. Absolute Expiration Check (Max Lifetime)
  if (currentTime - session.created_at > MAX_LIFETIME_MS) {
    await redisClient.del(sessionKey);
    throw new AppError("Session reached maximum lifetime. Please log in again.", 401, "SESSION_MAX_LIFETIME");
  }

  // 2. Idle Inactivity Check
  if (currentTime - session.last_accessed_at > IDLE_TIMEOUT_MS) {
    await redisClient.del(sessionKey);
    throw new AppError("Session expired due to inactivity.", 401, "SESSION_IDLE_TIMEOUT");
  }

  req.user = session;

  // 3. Time-Based Sliding
  // Only update Redis if more than 5 minutes have passed since last access
  if (currentTime - session.last_accessed_at > SLIDE_THRESHOLD_MS) {
    session.last_accessed_at = currentTime;
    
    // Save updated payload and reset Redis TTL to 10 minutes (600 seconds)
    await redisClient.set(
      sessionKey, 
      JSON.stringify(session), 
      Math.floor(IDLE_TIMEOUT_MS / 1000)
    );
  }

  next();
};