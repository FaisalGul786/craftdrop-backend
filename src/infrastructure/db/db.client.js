import { drizzle } from "drizzle-orm/neon-serverless"
import { Pool } from "@neondatabase/serverless"
import envConfig from "../../shared/env-config/env.variables.js"
const pool = new Pool({ connectionString: envConfig.DATABASE_URL })

export const db = drizzle(pool)