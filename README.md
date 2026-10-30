<div align="center">

# 🛒 CraftDrop API
**A Multi-Vendor Digital Marketplace for Creators**

[![Node.js](https://img.shields.io/badge/Node.js-18.x-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-5.x-404D59?style=for-the-badge)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Bun](https://img.shields.io/badge/Bun-1.2.0-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh/)

*CraftDrop is a hosted marketplace that handles everything between "I have a file" and "I got paid." This repository contains the backend REST API, built with a focus on performance, security, and clean modular architecture.*

</div>

---

## 🚀 Current Progress: What's Built So Far

Development is currently focused on the **Foundation** milestone. We have successfully implemented a highly secure, enterprise-grade user registration and session management system.

### 🔐 Auth & Identity System (Completed)
- **Email OTP Verification Flow:** Users register via a secure 6-digit OTP sent to their email.
- **Secure Password Reset Flow:** 
  - 3-phase architecture (Request, Verify OTP, Update Password) that leverages Redis to protect the database from write-heavy attacks.
  - Built-in anti-enumeration protection (always returns consistent 200 OK responses).
  - Cryptographically secure 32-byte reset tokens are exchanged for OTPs. Only their SHA-256 hashes are stored in Redis with a strict 60-minute non-sliding TTL.
- **Asynchronous Email Dispatch:** Leveraging **Upstash QStash** as a background job worker to trigger transactional emails via the **Brevo ESP**, ensuring the main API thread is never blocked.
- **Robust Rate Limiting & Security:** 
  - Atomic Redis counters to prevent OTP spam (Max 3 requests per 15 mins).
  - Isolated OTP attempt tracking (Max 5 failed attempts before clearing temp data).
  - Bcrypt password hashing (10 salt rounds).
- **Advanced Session Management:**
  - Opaque, Redis-backed sessions attached via secure `HttpOnly` cookies.
  - **Timestamp-based Sliding Expiration:** Sessions strictly enforce a 1-hour absolute maximum lifetime and a 10-minute idle timeout.
  - **Optimized Redis Writes:** Activity timestamps are only updated if 50% of the idle window has passed, drastically reducing database `WRITE` loads while keeping active users logged in.
- **Database Architecture:** `users` table implemented via **Drizzle ORM** and **PostgreSQL**, capturing explicit timezone-aware `emailVerifiedAt` timestamps safely generated on the server.
- **Global Error Handling:** Custom `AppError` class integrated with Express 5's native asynchronous error handling.

---

## 💻 Installation & Setup

This project strictly requires [Bun](https://bun.sh/) as the package manager and uses ESModules (`"type": "module"`).

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd craftdrop-backend
   ```

2. **Install dependencies:** 
   The `preinstall` script restricts installations to Bun.
   ```bash
   bun install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory. Based on the project dependencies, you will need connection strings and API keys for:
   - Neon PostgreSQL (Serverless)
   - Upstash Redis
   - Upstash QStash
   - Brevo (Transactional Emails)

4. **Run the server:**
   Start the development server with native Node.js watch mode:
   ```bash
   bun run dev
   ```
   Or start for production:
   ```bash
   bun run start
   ```

---

## 🗺️ Project Roadmap

CraftDrop is being built iteratively. Here is the roadmap of features currently in development and planned for upcoming releases.

### Phase 1: Foundation 🏗️ *(In Progress)*
- [x] Database schemas & Global error handling
- [x] OTP-based Registration & Email Dispatcher
- [x] Secure Session Management & Sliding Expiration
- [x] Secure Password Reset (Forgot Password) Flow
- [ ] User Login & Logout endpoints
- [ ] Creator Storefront profiles (Bio, unique URL slugs)

### Phase 2: Selling 📦 *(Upcoming)*
- [ ] Product creation (Draft, Publish, Unpublish, Archive)
- [ ] Secure direct-to-S3 file uploads (Files up to 100MB, Covers up to 5MB)
- [ ] Strict server-side content-type and size validation
- [ ] Marketplace Discovery (Paginated browsing, PostgreSQL full-text search, filtering)

### Phase 3: Buying 💳 *(Upcoming)*
- [ ] Checkout flow with hosted payment gateway integrations
- [ ] Webhook-driven order confirmations (Idempotent processing)
- [ ] Secure File Delivery (Time-limited, 10-minute signed download URLs)
- [ ] Buyer "My Purchases" library

### Phase 4: Money & Control 💰 *(Upcoming)*
- [ ] Automated platform commission calculation (Integer math for zero rounding errors)
- [ ] Creator earnings dashboard & ledger
- [ ] Payout requests with atomic database locks
- [ ] Admin moderation tools (Product removal, user suspension, audit logs)

---

## 🏗️ System Architecture

CraftDrop operates as a **Modular Monolith**. Each feature domain (Auth, Storefront, Products, Checkout) acts as an isolated module containing its own Controller, Service, and Repository layers.

<div align="center">
  <img src="./CraftDrop System Context Diagram.png" alt="CraftDrop System Context Diagram" width="800"/>
</div>

### 🛠️ Tech Stack
*   **Language:** Node.js / JavaScript (ESModules)
*   **Framework:** Express.js v5
*   **Database:** PostgreSQL (Neon Serverless)
*   **ORM:** Drizzle ORM
*   **Caching & State:** Redis (Upstash)
*   **Background Jobs:** Upstash QStash
*   **Transactional Emails:** Brevo (formerly Sendinblue)

---

<div align="center">
  <i>Building the future of digital marketplaces, one module at a time.</i>
</div>