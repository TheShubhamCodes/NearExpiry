# NearExpiry — Production Deployment Guide

This guide walks through deploying **NearExpiry** to production using:
- **Database:** MongoDB Atlas
- **Backend API:** Render (`server/`)
- **Frontend Web App:** Vercel (`client/`)

> [!IMPORTANT]
> Never commit `.env` files, database passwords, JWT secrets, or API keys to Git. Configure all sensitive values directly inside your Render and Vercel project dashboards.

---

## 1. Architecture Overview

- **Frontend (Vercel):** Static React + Vite SPA served over HTTPS (`client/`). Configured via [`client/vercel.json`](./client/vercel.json) for SPA client-side routing (`/(.*) -> /index.html`) and browser security headers. Communicates with the backend API using `VITE_API_URL` and `withCredentials: true`.
- **Backend (Render):** Node.js (>=18) + Express REST API (`server/`). Configured via [`render.yaml`](./render.yaml). Handles JWT HTTP-only cookie authentication, Helmet security headers, CSRF Origin verification, rate limiting, expiry/FEFO intelligence, analytics, Resend email alerts, Open Food Facts barcode lookups, and Cloudinary signed uploads.
- **Database (MongoDB Atlas):** Cloud replica-set MongoDB cluster storing store config, users, products, batches, stock movements, markdowns, returns, dispositions, sales, and notifications.

---

## 2. MongoDB Atlas Setup

1. Create a free **M0** or dedicated cluster in [MongoDB Atlas](https://www.cloud.mongodb.com/).
2. **Create a Database User:**
   - Go to **Database Access** -> **Add New Database User**.
   - Use Password authentication and save the username and password securely.
   - If the password contains special characters (`@`, `:`, `/`, `#`, `?`, `%`), URL-encode the password before placing it inside `MONGODB_URI`.
   - Grant **Read and write to any database** (or scoped read/write to `nearexpiry`).
3. **Configure Network Access:**
   - Go to **Network Access** -> **Add IP Address**.
   - On Render's standard/free tiers, outbound IPs change dynamically, so allow `0.0.0.0/0` (or add Render's static outbound IPs if you use a paid Render plan). Rely on strong credentials and TLS.
4. **Copy the Connection String:**
   - Click **Connect** -> **Drivers** (Node.js) and copy the `mongodb+srv://...` URI.
   - Explicitly include the database name `/nearexpiry` before query parameters:
     ```text
     mongodb+srv://<db_user>:<url_encoded_password>@<cluster-host>.mongodb.net/nearexpiry?retryWrites=true&w=majority
     ```
   - MongoDB Atlas provides a replica set out of the box, so multi-document Mongoose transactions in stock and action workflows operate with full ACID support.

---

## 3. Render Backend Deployment (`server/`)

You can deploy either via the included [`render.yaml`](./render.yaml) Blueprint or manually as a Web Service.

### Manual Web Service Settings
- **Repository:** Your NearExpiry Git repository
- **Root Directory:** `server`
- **Environment / Runtime:** `Node` (requires Node `>=18.0.0`, declared in [`server/package.json`](./server/package.json))
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Health Check Path:** `/api/health`

### Required Backend Environment Variables
Set these in **Render Dashboard -> Environment**:

| Variable | Required | Example / Notes |
| --- | --- | --- |
| `NODE_ENV` | Yes | `production` |
| `MONGODB_URI` | Yes | `mongodb+srv://...` Atlas URI |
| `JWT_SECRET` | Yes | Random string, **at least 32 characters** (e.g. `openssl rand -hex 32`) |
| `CLIENT_URL` | Yes | Exact Vercel production URL, **no trailing slash** (e.g. `https://nearexpiry.vercel.app`) |
| `CORS_ORIGINS` | No | Optional comma-separated extra origins (e.g. custom domain) |
| `COOKIE_SAME_SITE` | No | Defaults to `none` in `production` for cross-origin Vercel -> Render cookies |
| `RESEND_API_KEY` | No | Optional Resend API key (`re_...`) for email alerts |
| `EMAIL_FROM` | No | `NearExpiry <alerts@yourdomain.com>` (requires verified domain) or `NearExpiry <onboarding@resend.dev>` |
| `CLOUDINARY_CLOUD_NAME` | No | Optional Cloudinary cloud name for image uploads |
| `CLOUDINARY_API_KEY` | No | Optional Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | Optional Cloudinary API secret |

> [!WARNING]
> **Render Free Tier Cold Starts & Background Scheduler Behavior:**
> Render Free Web Services spin down after ~15 minutes of inactivity. Cold starts can take 20–50 seconds (the frontend API client uses a 30s timeout to accommodate this), and **in-process `node-cron` jobs (hourly expiry checks & daily 08:00 AM digest) pause while the instance is asleep**.
>
> To ensure uninterrupted scheduled alerts and digests in production, use an always-on Render paid instance, trigger manual checks from the Notifications page (`POST /api/notifications/trigger-check`), or call `GET /api/health` on an external uptime schedule.

---

## 4. Vercel Frontend Deployment (`client/`)

1. Import your NearExpiry Git repository in [Vercel](https://vercel.com/).
2. **Configure Project Settings:**
   - **Framework Preset:** `Vite`
   - **Root Directory:** `client`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. **Set Frontend Environment Variable:**
   - Add `VITE_API_URL` in **Vercel -> Project Settings -> Environment Variables**:
     ```text
     VITE_API_URL=https://<your-render-service>.onrender.com/api
     ```
   - Do **not** include a trailing slash (`/`).
   - **Important:** Vite embeds `VITE_*` variables during `vite build`. Whenever you add or edit `VITE_API_URL`, trigger a fresh Vercel redeployment.
4. Deploy and copy your final Vercel HTTPS URL (e.g. `https://nearexpiry.vercel.app`), then set that exact origin as `CLIENT_URL` on Render and redeploy/restart the Render service if needed.

> [!NOTE]
> **Cross-Origin HTTP-Only Cookies (`vercel.app` -> `onrender.com`):**
> NearExpiry authenticates using `HttpOnly` JWT cookies (`SameSite=None; Secure` in production). Modern Chromium browsers allow `SameSite=None; Secure` cross-origin API cookies over HTTPS, **however Apple Safari / iOS Intelligent Tracking Prevention (ITP)** blocks third-party cookies across different root domains (`*.vercel.app` vs `*.onrender.com`) when "Prevent cross-site tracking" is enabled.
>
> For full Safari / iOS support in production, connect a custom domain you own using subdomains under the same root domain (e.g. `app.yourdomain.com` on Vercel and `api.yourdomain.com` on Render), or configure a same-origin Vercel proxy rewrite for `/api/*`.

---

## 5. Resend Email Alerts Setup

NearExpiry uses Resend for optional expiry alerts and daily digests (`server/src/services/emailService.js`):
1. Create an account at [Resend](https://resend.com/) and generate an API key (`RESEND_API_KEY`).
2. **Sandbox vs Custom Domain:**
   - While testing with `EMAIL_FROM=NearExpiry <onboarding@resend.dev>`, Resend only delivers emails to your own verified Resend signup email address.
   - To deliver notifications and digests to store owners or other staff email addresses, verify a custom domain in **Resend -> Domains** (adding the required DNS SPF/DKIM records) and set `EMAIL_FROM=NearExpiry <alerts@yourdomain.com>`.
3. If `RESEND_API_KEY` is omitted, the backend logs that email sending is skipped and continues operating normally with in-app notifications.

---

## 6. Cloudinary Product Image Uploads Setup

Product image uploads are handled securely through the backend (`POST /api/products/upload-image` using [`cloudinaryService.js`](./server/src/services/cloudinaryService.js)):
1. Create an account at [Cloudinary](https://cloudinary.com/) and copy your **Cloud Name**, **API Key**, and **API Secret**.
2. Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` to your **Render** backend environment variables (never in `client/`).
3. Uploaded images are strictly validated for MIME type (`JPEG`, `PNG`, `WEBP`, `GIF`), binary file magic bytes, and a 5 MB file-size cap before being signed with SHA-1 on the server and uploaded to folder `nearexpiry/products`.
4. If Cloudinary credentials are not set, `/api/products/upload-image` cleanly returns HTTP `503`, while manual `https://` image URLs and Open Food Facts barcode images continue working without interruption.

---

## 7. Camera Barcode Scanning & Browser Notifications (HTTPS)

- **Camera Barcode Scanner (`@zxing/browser`):** Browsers require a **Secure Context (HTTPS)** for `navigator.mediaDevices.getUserMedia`. Vercel automatically provides HTTPS, so phone and laptop cameras work in production once camera permissions are granted (plain HTTP preview URLs on mobile LAN IPs will block camera access).
- **Web Browser Notifications:** Browser push/desktop alert permission also requires HTTPS in production.
- **Open Food Facts Barcode Lookup:** Executed server-side from Render over HTTPS (`https://world.openfoodfacts.org/api/v2/product/...`) with a 6-second timeout and graceful manual fallback.

---

## 8. First-Time Production Store Setup

1. Open your deployed Vercel URL (`https://your-app.vercel.app`).
2. Wait briefly if Render is waking from a cold start, or check `https://your-api.onrender.com/api/health`.
3. Because the production MongoDB Atlas database starts empty, `/login` automatically displays **Create Your Store Account** (and `/register` is open).
4. Register your Store Name, currency, and sole Store Owner account.
5. Public registration automatically locks after the Store Owner is created. Additional cashier/staff accounts must be created internally by the Store Owner on the **Staff** page.

---

## 9. Post-Deployment Verification Checklist

- [ ] `GET https://<render-backend>/api/health` returns HTTP `200` with `"database": { "state": "connected", "connected": true }`.
- [ ] Opening `https://<vercel-frontend>/register` directly in browser (or refreshing `/inventory`, `/analytics`, `/ai-insights`) loads the React app cleanly with no Vercel `404`.
- [ ] Store setup on `/register` creates Store + Owner, sets HTTP-only cookie, and stays logged in across page refresh.
- [ ] Employee creation works as Owner and non-owner API calls return `403`.
- [ ] Product creation + Open Food Facts lookup + Cloudinary image upload (if configured) save properly.
- [ ] Settings test email sends (if Resend configured & domain/recipient verified).

---

## 10. Troubleshooting

| Issue | Likely Cause | Fix |
| --- | --- | --- |
| CORS / `403 CSRF Untrusted request origin` | `CLIENT_URL` on Render has a trailing `/` or mismatches Vercel URL | Set `CLIENT_URL=https://exact-app.vercel.app` (no trailing slash) and redeploy Render |
| Logged out immediately after `/login` | Safari/iOS blocking cross-site cookie (`vercel.app` -> `onrender.com`) or `NODE_ENV` not `production` | Ensure `NODE_ENV=production` on Render; for Safari/iOS use same-root-domain custom subdomains (`app.` & `api.`) or same-origin `/api` rewrite |
| `404 Not Found` on page refresh in Vercel | Missing SPA rewrite rules | Ensure Vercel Root Directory is `client` so [`client/vercel.json`](./client/vercel.json) is applied |
| Frontend sends requests to `vercel.app/api/...` and fails | `VITE_API_URL` missing when Vercel built `dist/` | Set `VITE_API_URL=https://<backend>.onrender.com/api` in Vercel and redeploy |
| Render deploy crashes on startup | Missing `MONGODB_URI`, short `JWT_SECRET` (< 32 chars), or invalid `CLIENT_URL` | Check Render deploy logs for `[Startup Failed]` validation output and fix env vars |
| `GET /api/health` returns `503 degraded` | Atlas IP whitelist missing `0.0.0.0/0` or wrong Atlas credentials | Check MongoDB Atlas Network Access & URL-encoded DB password |
| Email test fails or doesn't arrive | Using `onboarding@resend.dev` to send to another person's email | Verify your custom domain in Resend and set `EMAIL_FROM` to your domain |

