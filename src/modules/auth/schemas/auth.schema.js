import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';


// User role enum definition
export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

// Users Table Schema
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: varchar('display_name', { length: 80 }).notNull(),
  role: userRoleEnum('role').default('user').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

