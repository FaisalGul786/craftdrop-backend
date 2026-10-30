import {registerService, verifyOTPService, loginUserService, requestPasswordResetService, 
  verifyResetOTPService, 
  resetPasswordService} from "../services/auth.service.js"
import { qstashReceiver } from "../../../infrastructure/qstash/qstash.client.js";
import { brevoClient } from "../../../infrastructure/brevo/brevo.client.js"


/**
 * POST /auth/register
 */
export const register = async (req, res) => {
	const { email, password, displayName } = req.body;

	const result = await  registerService({
		email,
		password,
		displayName,
	});

	// Step 9: Return 202 ACCEPTED (Sequence 18, 19)
  return res.status(202).json({
    success: true,
    message: "Registration accepted. Please check your email for the OTP.",
    data: result,
  });
};


/**
 * POST /auth/jobs/send-email (Worker Route called by QStash)
 */
export const sendEmailJob = async (req, res) => {
  const signature = req.headers["upstash-signature"];
  console.log('\n\n\n working ', signature)
  // Verify QStash Signature in production
  if (process.env.NODE_ENV === "production") {
    try {
      const isValid = await qstashReceiver.verify({
        signature,
        body: JSON.stringify(req.body),
      });

      if (!isValid) {
        throw new AppError("Invalid QStash signature", 401);
      }
    } catch (err) {
      throw new AppError("Unauthorized request", 401);
    }
  }

  const { email, displayName, otp } = req.body;

  // Dispatch Email via Brevo ESP
  const response = await brevoClient.transactionalEmails.sendTransacEmail({
    subject: "Verify your CraftDrop Account",
    htmlContent: `<p>Hi ${displayName},</p><p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
    sender: {
      name: "CraftDrop",
      email: process.env.BREVO_SENDER_EMAIL, 
    },
    to: [
      {
        email: email,
        name: displayName,
      },
    ],
  });

  // Return 200 OK to QStash to acknowledge successful job execution
  return res.status(200).json({ 
    success: true, 
    messageId: response.messageId 
  });
};


/**
 * POST /auth/verify-otp for register
 */
export const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  const { newUser, sessionId } = await verifyOTPService({ email, otp });
  console.log('User created with this data ', newUser)

  // Set secure HttpOnly cookie for session
  res.cookie("sessionId", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 1000, //  in milliseconds
  });

  return res.status(201).json({
    success: true,
    message: "Account verified and created successfully.",
    data: {
      id: newUser.id,
      email: newUser.email,
      displayName: newUser.displayName
    },
  });
};


/**
 * POST /auth/login
 */
export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  const { user, sessionId } = await loginUserService({ email, password });

  // Set secure HttpOnly cookie for session matching verifyOTP configuration
  res.cookie("sessionId", sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 1000, // 1 hour in milliseconds
  });

  return res.status(200).json({
    success: true,
    message: "Login successful.",
    data: user,
  });
};


export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  await requestPasswordResetService(email);
  
  return res.status(200).json({
    success: true,
    message: "If an account exists, an OTP has been sent."
  });
};

export const verifyResetOTP = async (req, res) => {
  const { email, otp } = req.body;
  const data = await verifyResetOTPService(email, otp);

  return res.status(200).json({
    success: true,
    message: "OTP verified successfully.",
    data
  });
};

export const resetPassword = async (req, res) => {
  const { resetToken, newPassword } = req.body;
  await resetPasswordService(resetToken, newPassword);

  return res.status(200).json({
    success: true,
    message: "Password successfully reset."
  });
};

export const sendResetEmailJob = async (req, res) => {
  const signature = req.headers["upstash-signature"];
  
  if (process.env.NODE_ENV === "production") {
    try {
      const isValid = await qstashReceiver.verify({ signature, body: JSON.stringify(req.body) });
      if (!isValid) throw new AppError("Invalid signature", 401);
    } catch (err) {
      throw new AppError("Unauthorized", 401);
    }
  }

  const { email, displayName, otp } = req.body;

  const response = await brevoClient.transactionalEmails.sendTransacEmail({
    subject: "Reset your CraftDrop Password",
    htmlContent: `<p>Hi ${displayName},</p><p>Your password reset code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
    sender: { name: "CraftDrop", email: process.env.BREVO_SENDER_EMAIL },
    to: [{ email, name: displayName }],
  });

  return res.status(200).json({ success: true, messageId: response.messageId });
};