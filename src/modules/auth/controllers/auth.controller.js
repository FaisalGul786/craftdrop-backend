import {registerService, verifyOTPService} from "../services/auth.service.js"
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
 * POST /auth/verify-otp
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