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

// forgot-password variables
const RESET_RATE_LIMIT_TTL_SECONDS = 900; // 15 minutes
const MAX_RESET_REQUESTS_PER_WINDOW = 3;
const RESET_TOKEN_TTL_SECONDS = 3600; // 60 minutes


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





/**
 * Handles user login authentication (Redis-first lockout & session generation).
 * @param {Object} payload - { email, password }
 */
export const loginUserService = async (payload) => {
  const { email, password } = payload;
  const normalizedEmail = email.toLowerCase().trim();

  const lockoutKey = `login_failures:${normalizedEmail}`;

  // Sequence 9, 10: Check Lockout Status in Redis first
  const failureCount = await redisClient.get(lockoutKey);
  if (failureCount && parseInt(failureCount, 10) >= 5) {
    throw new AppError(
      "Account temporarily locked due to too many failed attempts. Please try again in 15 minutes.",
      429,
      "ACCOUNT_LOCKED"
    );
  }

  // Sequence 12, 13: Fetch User from DB
  const user = await UserRepository.findUserByEmail(normalizedEmail);
  if (!user) {
    throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  }

  // Sequence 16, 17: Check Account Suspension Status
  if (user.suspendedAt) {
    throw new AppError("Account has been suspended.", 403, "ACCOUNT_SUSPENDED");
  }

  // Sequence 19: Verify Password Hash
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    // Sequence 20, 21, 22: Increment failure tracking and apply 15-min TTL on 5th failure
    const newCount = await redisClient.incr(lockoutKey);
    if (newCount === 5) {
      await redisClient.expire(lockoutKey, 900); 
    }
    throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  }

  // Sequence 25, 26, 27: Successful Login - Clear failures and create session
  if (failureCount) {
    await redisClient.del(lockoutKey);
  }

  const sessionId = await createSessionService(user.id);

  return {
    sessionId,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role
    }
  };
};





export const requestPasswordResetService = async (email) => {
  const normalizedEmail = email.toLowerCase().trim();
  const rateLimitKey = `rl:forgot_pwd:${normalizedEmail}`;

  // Rate Limiting
  const requestCount = await redisClient.incr(rateLimitKey);
  if (requestCount === 1) {
    await redisClient.expire(rateLimitKey, RESET_RATE_LIMIT_TTL_SECONDS);
  }
  if (requestCount && parseInt(requestCount, 10) > MAX_RESET_REQUESTS_PER_WINDOW) {
    throw new AppError("Too many password reset requests. Please try again later.", 429, "RATE_LIMITED");
  }

  const user = await UserRepository.findUserByEmail(normalizedEmail);
  
  if (user) {
    const otp = generateOTP();
    const otpKey = `forgot_otp:${normalizedEmail}`;
    
    await redisClient.set(otpKey, otp, OTP_EXPIRATION_SECONDS);

    const appUrl = process.env.APP_URL || "http://localhost:5000";
    await qstashClient.publishJSON({
      url: `${appUrl}/auth/jobs/send-reset-email`,
      body: { email: normalizedEmail, displayName: user.displayName, otp },
      retries: 3,
    });
  }

  // Always return same response to prevent enumeration
  return { success: true };
};

export const verifyResetOTPService = async (email, otp) => {
  const normalizedEmail = email.toLowerCase().trim();
  const otpKey = `forgot_otp:${normalizedEmail}`;
  const attemptsKey = `forgot_otp_attempts:${normalizedEmail}`;

  const storedOtp = await redisClient.get(otpKey);
  if (!storedOtp) {
    throw new AppError("OTP expired or invalid.", 400, "OTP_EXPIRED");
  }

  if (storedOtp !== parseInt(otp, 10)) {
    const attempts = await redisClient.incr(attemptsKey);
    if (attempts === 1) await redisClient.expire(attemptsKey, OTP_EXPIRATION_SECONDS);
    if (attempts > 5) {
      await redisClient.del(otpKey, attemptsKey);
      throw new AppError("Maximum attempts exceeded. Request a new OTP.", 429, "MAX_ATTEMPTS");
    }
    throw new AppError("Invalid OTP.", 400, "INVALID_OTP");
  }

  const user = await UserRepository.findUserByEmail(normalizedEmail);
  if (!user) throw new AppError("User not found.", 404, "USER_NOT_FOUND");

  // Success: Clean up OTP state
  await redisClient.del(otpKey, attemptsKey);

  // Generate Reset Token
  const resetToken = crypto.randomBytes(32).toString("hex");
  console.log('\n crytographical token generated . . . ', resetToken)
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
  console.log('\n\n crytographical hash token generated . . . ', hashedToken)

  
  const tokenKey = `reset_token:${hashedToken}`;
  await redisClient.set(tokenKey, user.id, RESET_TOKEN_TTL_SECONDS);

  return { resetToken };
};

export const resetPasswordService = async (resetToken, newPassword) => {
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
  const tokenKey = `reset_token:${hashedToken}`;

  const userId = await redisClient.get(tokenKey);
  if (!userId) {
    throw new AppError("Invalid or expired reset token.", 400, "INVALID_TOKEN");
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(newPassword, saltRounds);

  await UserRepository.updateUserPassword(userId, passwordHash);
  await redisClient.del(tokenKey);

  return { success: true };
};