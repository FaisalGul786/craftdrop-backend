import { defineConfig } from "drizzle-kit"
import dotenv from "dotenv"
import path from "path"


dotenv.config()

const databaseUrl = process.env.DATABASE_CONNECTION_DIRECT

if (!databaseUrl) {
  throw new Error("DATABASE_URL_DIRECT is missing in .env")
}

console.log("Database direct URL for migrations loaded successfully.")

export default defineConfig({
  schema: [
    "./src/modules/**/*.schema.js",
  ],
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
    ssl: true,
  },
})