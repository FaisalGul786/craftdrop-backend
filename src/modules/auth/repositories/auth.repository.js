
import { db } from "../../../infrastructure/db/db.client.js";
import { users } from "../schemas/auth.schema.js";
import { eq } from "drizzle-orm";

/**
 * Finds a user by email address (case-insensitive check).
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
export const findUserByEmail = async (email) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  return user || null;
};

/**
 * Creates a new user in the database.
 * @param {Object} userData 
 * @returns {Promise<Object>}
 */
export const createUser = async (userData) => {
  const [newUser] = await db
    .insert(users)
    .values(userData)
    .returning();
    
  return newUser;
};

export const UserRepository = {
  findUserByEmail, createUser
};