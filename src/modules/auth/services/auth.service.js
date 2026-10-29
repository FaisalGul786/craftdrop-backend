import bcrypt from "bcryptjs";
import crypto from "crypto";
import { UserRepository } from "../repositories/auth.repository.js";
import { AppError } from "../../../shared/error-handlers/error.class.js";
import { redisClient } from "../../../infrastructure/redis/redis.client.js";
import { qstashClient } from "../../../infrastructure/qstash/qstash.client.js";
import {generateOTP} from "../../../shared/utils/helper.functions.js"

// TTL for pending registration data and OTP (10 minutes)
const OTP_EXPIRATION_SECONDS = 600;

// Rate limit settings: Max 3 OTP requests per 15 minutes (900 seconds)
const EMAIL_RATE_LIMIT_TTL_SECONDS = 900;
const MAX_OTP_REQUESTS_PER_WINDOW = 3;

// 10-minute session TTL to match middleware sliding strategy
const SESSION_TTL_SECONDS = 600;


/**
 * Handles registration business logic.
 * @param {Object} payload - { email, password, displayName }
 */
export const registerService = async (payload) => {
  const { email, password, displayName } = payload;
  const normalizedEmail = email.toLowerCase().trim();

    // Step 10: Check if email exists in PostgreSQL database
const existingUser = await UserRepository.findUserByEmail(normalizedEmail);
if (existingUser) {
  throw new AppError("Email is already registered", 409, "EMAIL_TAKEN");
}

  // Sequence Item 16 , 8 , 9.1 , 9.2: ATOMIC RATE LIMIT CHECK & INCREMENT (Upfront before expensive operations)

  const rateLimitKey = `rl:email:${normalizedEmail}`;
  const requestCount = await redisClient.incr(rateLimitKey);

  // Set TTL only on key creation
  if (requestCount === 1) {
   await redisClient.expire(rateLimitKey, EMAIL_RATE_LIMIT_TTL_SECONDS);
 }

 // Block immediately if limit exceeded

 if (requestCount && parseInt(requestCount, 10) >= MAX_OTP_REQUESTS_PER_WINDOW) {
  throw new AppError(
    "Too many OTP requests. Please try again after 15 minutes.",
    429,
    "RATE_LIMITED"
    );
}



  // Step 5: Check Pending OTP in Redis (Sequence items 12, 13.1, 13.2, 13.3)
const redisKey = `pending_registration:${normalizedEmail}`;
const pendingRegistration = await redisClient.get(redisKey);

if (pendingRegistration) {
  throw new AppError(
    "OTP already sent. Please check your inbox.", 
    409, 
    "OTP_ALREADY_SENT"
    );
}

  // Step 6: Hash Password
const saltRounds = 10;
const passwordHash = await bcrypt.hash(password, saltRounds);

  // Generate 6-digit OTP (Sequence item 14)
  /**
 * Generates a cryptographically secure 6-digit numeric OTP.
 * @returns {string}
 */
const otp = generateOTP();

  // Step 7: Store Registration Data & OTP in Redis (Sequence item 15)
const pendingPayload = {
  email: normalizedEmail,
  displayName,
  passwordHash,
  otp,
  createdAt: new Date().toISOString(),
};

await redisClient.set(
  redisKey,
  JSON.stringify(pendingPayload),
  OTP_EXPIRATION_SECONDS
  );


  // Step 8: Publish job to QStash for asynchronous email delivery (Sequence 17)
const appUrl = process.env.APP_URL || "http://localhost:5000";
await qstashClient.publishJSON({
  url: `${appUrl}/auth/jobs/send-email`,
  body: {
    email: normalizedEmail,
    displayName,
    otp,
  },
  retries: 3,
});

return {
  email: normalizedEmail,
  displayName,
    otp, // Passed to subsequent workflow steps (e.g. Email Dispatcher)
  };
};


/**
 * Creates a secure session in Redis. Reusable for login.
 * @param {string} userId 
 * @returns {Promise<string>} sessionId
 */
export const createSessionService = async (userId) => {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const sessionKey = `session:${sessionId}`;

  const currentTime = Date.now();
  const sessionPayload = {
    userId,
    created_at: currentTime,
    last_accessed_at: currentTime
  };
  
  await redisClient.set(
    sessionKey,
    JSON.stringify(sessionPayload),
    SESSION_TTL_SECONDS
  );
  
  return sessionId;
};


/**
 * Handles OTP verification and user creation (Sequence 20 - 25.3.1).
 * @param {Object} payload - { email, otp }
 */
export const verifyOTPService = async (payload) => {
  const { email, otp } = payload;
  const normalizedEmail = email.toLowerCase().trim();

  const pendingKey = `pending_registration:${normalizedEmail}`;
  const attemptsKey = `otp_attempts:${normalizedEmail}`;

  // 21, 22: Get temp data from redis
  const pendingRegistration = await redisClient.get(pendingKey);
  
  if (!pendingRegistration) {
    throw new AppError("OTP expired or invalid. Please register again.", 400, "OTP_EXPIRED");
  }

  // 24.1, 24.2, 24.3: Update OTP attempts counter separately to avoid race conditions
  const attempts = await redisClient.incr(attemptsKey);
  
  if (attempts === 1) {
    await redisClient.expire(attemptsKey, OTP_EXPIRATION_SECONDS);
  }

  // 25.1: Check if attempts exceed 5
  if (attempts > 5) {
    await redisClient.del(pendingKey, attemptsKey);
    throw new AppError("Maximum OTP attempts exceeded. Please register again.", 429, "MAX_OTP_ATTEMPTS");
  }

  const parsedData = typeof pendingRegistration === "string" 
    ? JSON.parse(pendingRegistration) 
    : pendingRegistration;

  // 25.2.1: Validate OTP
  if (parsedData.otp !== otp) {
    throw new AppError("Invalid OTP.", 400, "INVALID_OTP");
  }

  // 25.2.2: OTP is valid, create user in DB
  const newUser = await UserRepository.createUser({
    email: parsedData.email,
    passwordHash: parsedData.passwordHash,
    displayName: parsedData.displayName,
    role: "user",
    emailVerifiedAt: new Date(),
  });

  // 25.3.1: Create session
  const sessionId = await createSessionService(newUser.id);
  
  // 25.2.3: Delete temp data and attempts on success
  await redisClient.del(pendingKey, attemptsKey);

  return { newUser, sessionId };
};


