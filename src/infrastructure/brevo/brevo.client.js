import { BrevoClient } from "@getbrevo/brevo";
import envConfig from "../../shared/env-config/env.variables.js"


if (!envConfig.BREVO_API_KEY) {
  console.warn("⚠️ Warning: BREVO_API_KEY is not defined in environment variables.");
}

// Initialize Brevo Client for email delivery
export const brevoClient = new BrevoClient({
  apiKey: envConfig.BREVO_API_KEY,
});