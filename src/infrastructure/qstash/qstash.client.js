import envConfig from "../../shared/env-config/env.variables.js";
import { Client, Receiver } from "@upstash/qstash";

const isDev = process.env.NODE_ENV !== "production" || envConfig.QSTASH_DEV === "true";

export const qstashClient = new Client({
  token: envConfig.QSTASH_TOKEN || "mock-token",
  baseUrl: envConfig.QSTASH_URL || (isDev ? "http://127.0.0.1:8080" : undefined),
});

export const qstashReceiver = new Receiver({
  currentSigningKey: envConfig.QSTASH_CURRENT_SIGNING_KEY || "sig_dev_current",
  nextSigningKey: envConfig.QSTASH_NEXT_SIGNING_KEY || "sig_dev_next",
});