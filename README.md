# Smart Canteen — College Canteen Pre-Ordering System

**Smart Canteen** is a full-stack college canteen pre-ordering platform designed to eliminate counter queues, minimize wait times between lectures, prevent manual ordering errors, and give canteen staff and administrators real-time operational control.

---

## 1. Architecture & Technology Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Radix/shadcn-style UI primitives + Lucide Icons + Recharts + `qrcode.react`
- **Backend**: Node.js + Express.js REST API + WebSocket real-time hub (`ws`) on port `3000`
- **Database**: Hosted Cloud SQL for **PostgreSQL** (`pg` Pool + **Drizzle ORM** / Drizzle Kit)
- **Authentication & RBAC**:
  - Google Sign-In via Firebase Authentication (`firebase` + `firebase-admin` ID token verification)
  - Email & Password registration/login (`bcryptjs` password hashing + signed `HttpOnly` JWT session cookies)
  - Strict server-side role enforcement (`student`, `staff`, `admin`)

> **Stack Alignment Note**: Cloud SQL PostgreSQL with Drizzle ORM and Firebase Auth was provisioned in `asia-south1` instead of Supabase so the relational database, authentication, and Cloud Run hosting run natively in a single Google Cloud region with zero external database sleep timeouts.

---

## 2. Database Schema (`src/db/schema.ts`)

13 normalized PostgreSQL tables with foreign keys, unique constraints, and B-tree indexes:

1. `roles` — `student`, `staff`, `admin`
2. `users` — `uid`, `email`, `password_hash`, `role_id`, `role_name`, `is_active`, `is_demo`
3. `profiles` — `user_id`, `full_name`, `department`, `enrollment_id`, `phone`, `avatar_url`
4. `categories` — `Breakfast`, `Lunch`, `Snacks`, `Beverages`, `Fast Food`, `Desserts`
5. `menu_items` — `category_id`, `name`, `description`, `price`, `image_url`, `prep_time_minutes`, `is_available`, `is_featured`, `is_todays_special`, `popularity_score`, `is_demo`
6. `carts` — per-user persistent cart
7. `cart_items` — `(cart_id, menu_item_id)` unique item quantities
8. `pickup_slots` — 15-minute pickup windows with `max_capacity`
9. `orders` — `order_number`, `user_id`, `pickup_slot_id`, `pickup_date`, `status`, `subtotal`, `total_amount`, `pickup_code`, `qr_payload`, `idempotency_key`, `is_demo`, `completed_at`
10. `order_items` — item name & unit price snapshots per order
11. `payments` — `order_id`, `method`, `status`, `amount`, `transaction_ref`, `is_demo_mode`
12. `order_status_history` — full audit log of every status transition
13. `notifications` — persistent in-app order alerts

---

## 3. Demo Accounts (For Testing & Evaluation)

The initial database seed creates clearly tagged demo accounts (`isDemo = true`) and sample menu/order records (`isDemo = true` — separated from live orders in Admin Analytics via the **Live Orders Only** filter):

| Role | Email | Password |
| :--- | :--- | :--- |
| **Student / College Staff** | `student@campus.edu` | `Student@123` |
| **Canteen Staff** | `staff@campus.edu` | `Staff@123` |
| **Administrator** | `admin@campus.edu` | `Admin@123` |

> **Security Note**: Never reuse demo passwords for production staff or admin accounts. Administrators can create real accounts or promote registered Google Sign-In users from **Admin Console → Users & Roles**, and deactivate demo accounts before opening the canteen to students.

---

## 4. Environment Variables (`.env.example`)

- `SQL_HOST` — Cloud SQL Auth Proxy Unix socket path (injected automatically in AI Studio / Cloud Run)
- `SQL_DB_NAME` — PostgreSQL database name
- `SQL_USER` / `SQL_PASSWORD` — Runtime read/write application credentials
- `SQL_ADMIN_USER` / `SQL_ADMIN_PASSWORD` — Drizzle Kit schema migration credentials
- `JWT_SECRET` — Secret key for signing `HttpOnly` session tokens (set a strong random 32+ char string in production)
- `APP_URL` — Public HTTPS origin of the deployed application
- `PORT` — Server listening port (default `3000`)

---

## 5. Local Development & Production Deployment

### Local Setup
```bash
npm install
npx drizzle-kit push --config=src/db/drizzle.config.ts
npm run dev
```

### Production Build & Run
```bash
npm run build
NODE_ENV=production npm start
```

### Hosting & 30-Day Availability Notes
- **AI Studio Cloud Run + Cloud SQL (`asia-south1`)**:
  - The deployed Cloud Run service serves both the Vite production bundle (`dist/`) and Express/WebSocket API over HTTPS.
  - **Persistence & Retention**: Cloud SQL for PostgreSQL Developer Edition stores all users, menus, orders, and payments on persistent cloud disk storage—data survives server restarts and container scaling.
  - **Free-Tier / Cost & Scale-to-Zero Considerations**: Cloud SQL Developer Edition and Cloud Run scale to zero when idle to minimize billing, meaning the first request after an idle period may experience a ~1–2 second cold-start wakeup, and ongoing availability beyond trial credits depends on active Google Cloud billing and project quota limits. To guarantee uninterrupted 30+ day uptime without cold starts during peak campus lunch hours, set Cloud Run minimum instances to `1` and monitor Cloud Billing budgets.

---

## 6. Known Limitations

- **Payment Processing**: Uses a clearly labelled **Demo Payment Mode** (`UPI Demo`, `Card Demo`, `Campus Pay`) with simulated Success and Fail outcomes. Integrating live Razorpay/Stripe settlement requires adding merchant API keys and webhook signature verification on the backend.
- **QR Scanning at Counter**: Staff counter verification accepts typed 6-character pickup codes (`SC7394`), Order IDs (`SC-...`), or scanned QR JSON payloads from USB/Bluetooth barcode scanners acting as keyboard wedges. Native browser camera QR decoding can be layered onto the verification bar if mobile-tablet camera scanning is needed.
- **Notifications**: Delivered in-app in real time over WebSockets and persisted in PostgreSQL (`notifications` table). External SMS/Email delivery requires configuring an SMTP or SMS provider.
