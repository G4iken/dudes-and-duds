# Dudes & Duds — Full Stack E-commerce

**Stack:** Node.js + Express + MySQL → Railway &nbsp;|&nbsp; Static HTML → Vercel  
**Auth:** JWT · **Payments:** COD + PayMongo ready · **PH-first:** GCash, Maya, COD

---

## One-time Setup (do this before pushing to GitHub)

### Step 1 — Clone / init your repo

```bash
git init
git remote add origin https://github.com/G4iken/dudes-and-duds.git
```

### Step 2 — Deploy backend to Railway

1. Go to **https://railway.app** → New Project → Deploy from GitHub Repo  
   Set **Root Directory** = `backend`

2. Add a **MySQL** database service to the same project  
   Railway auto-injects `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`

3. In your backend service → **Variables**, add these manually:

```
NODE_ENV=production
JWT_SECRET=<run: openssl rand -base64 48>
JWT_EXPIRES_IN=7d
JWT_ADMIN_EXPIRES_IN=1d
ALLOWED_ORIGINS=https://YOUR-APP.vercel.app
```

> Railway automatically provides `PORT` — do not set it manually.

4. In Railway → your backend service → **Settings → Deploy Hooks** → Generate  
   Copy the webhook URL — you'll need it for GitHub Actions.

5. Open a Railway **Shell** and run:
```bash
node config/migrate.js
node config/seed.js
```

6. Go to **Settings → Domains** → Generate Domain  
   Copy it — looks like `dudes-backend.up.railway.app`

---

### Step 3 — Update two lines in the repo

**File 1:** `frontend/vercel.json` — line 12, replace the proxy destination:
```json
"dest": "https://dudes-backend.up.railway.app/api/$1"
```

**File 2:** `frontend/public/config.js` — update if needed (defaults work via Vercel proxy):
```js
// No changes needed if using Vercel proxy — /api/* routes to Railway automatically
```

---

### Step 4 — Deploy frontend to Vercel

1. Go to **https://vercel.com** → New Project → Import GitHub repo  
   Set **Root Directory** = `frontend`

2. No build command needed — it's static HTML.

3. After deploy, copy your Vercel URL (e.g. `https://dudes-and-duds.vercel.app`)

4. Go back to Railway → backend Variables → update:
```
ALLOWED_ORIGINS=https://dudes-and-duds.vercel.app
```

---

### Step 5 — Set GitHub Secrets (for auto-deploy on push)

Go to your GitHub repo → **Settings → Secrets → Actions** → add:

| Secret Name | Where to get it |
|-------------|----------------|
| `RAILWAY_DEPLOY_WEBHOOK` | Railway → service → Settings → Deploy Hooks |
| `VERCEL_TOKEN` | https://vercel.com/account/tokens |
| `VERCEL_ORG_ID` | Run `vercel whoami --json` or Vercel dashboard |
| `VERCEL_PROJECT_ID` | Vercel project → Settings → General |

After this, every `git push origin main` auto-deploys both backend and frontend.

---

## Local Development

```bash
# Backend
cd backend
cp .env.example .env
# Fill in .env with your local MySQL credentials

npm install
node config/migrate.js
node config/seed.js
npm run dev              # → http://localhost:5000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev              # → http://localhost:3000
```

---

## Seeded Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@dudesandduds.ph | Admin@DnD2025! |

**Change the admin password immediately after first login.**

### Seeded Discount Codes

| Code | Type | Value | Min Order |
|------|------|-------|-----------|
| `DUDE20` | Percent | 20% off | ₱500 |
| `WELCOME10` | Percent | 10% off | — |
| `FLAT150` | Fixed | ₱150 off | ₱1,500 |

---

## Project Structure

```
dudes-and-duds/
├── .github/
│   └── workflows/
│       └── deploy.yml          ← auto-deploy on git push
├── backend/
│   ├── config/
│   │   ├── db.js               ← MySQL pool
│   │   ├── migrate.js          ← create tables (run once)
│   │   └── seed.js             ← seed data (run once)
│   ├── controllers/            ← business logic
│   │   ├── authController.js
│   │   ├── productController.js
│   │   ├── cartController.js
│   │   ├── orderController.js
│   │   ├── adminController.js
│   │   └── newsletterController.js
│   ├── middleware/
│   │   ├── auth.js             ← JWT verify, requireAdmin, optionalAuth
│   │   └── validate.js         ← express-validator error handler
│   ├── routes/                 ← route definitions
│   │   ├── auth.js
│   │   ├── products.js
│   │   ├── cart.js
│   │   ├── orders.js
│   │   ├── admin.js
│   │   └── newsletter.js
│   ├── server.js               ← Express entry point
│   ├── package.json
│   ├── railway.json
│   ├── Procfile
│   ├── .nvmrc                  ← pins Node 20
│   └── .env.example            ← copy to .env, never commit .env
└── frontend/
    ├── public/
    │   ├── index.html          ← complete storefront (94KB, zero deps)
    │   └── config.js           ← runtime API URL config
    ├── package.json
    └── vercel.json             ← static deploy + /api proxy to Railway
```

---

## Full API Reference

### Auth — `/api/auth`
```
POST   /register          Create account {name, email, password, phone?}
POST   /login             Login {email, password} → {token, user}
GET    /me                My profile + addresses      [JWT required]
PATCH  /me                Update profile              [JWT required]
POST   /change-password   Change password             [JWT required]
POST   /address           Add shipping address        [JWT required]
```

### Products — `/api/products`
```
GET    /                  List all (filter: category, badge, featured, search, sort, page, limit)
GET    /:slug             Single product + variants + reviews
GET    /categories        All categories
POST   /:id/reviews       Submit review               [optional JWT]
POST   /                  Create product              [Admin]
PATCH  /:id               Update product              [Admin]
DELETE /:id               Soft-delete product         [Admin]
PATCH  /variants/:id/stock  Update stock              [Admin]
```

### Cart — `/api/cart` (all require JWT)
```
GET    /                  Get cart with totals + free-shipping status
POST   /                  Add item {variant_id, quantity}
PATCH  /:cartItemId       Update quantity {quantity}
DELETE /:cartItemId       Remove item
DELETE /                  Clear cart
```

### Orders — `/api/orders`
```
POST   /                         Place order           [optional JWT — guests allowed]
GET    /                         My orders             [JWT required]
GET    /:orderNumber             Order detail          [optional JWT]
POST   /:orderNumber/cancel      Cancel order          [JWT required]
GET    /admin/all                All orders            [Admin]
PATCH  /admin/:id/status         Update status         [Admin]
```

### Admin — `/api/admin` (all require Admin JWT)
```
GET    /dashboard          Stats: revenue, orders, customers, top products, chart
GET    /users              Customer list (search, paginate)
GET    /reviews            All reviews (filter by approved)
PATCH  /reviews/:id        Approve/reject review
GET    /newsletter         Subscriber list
GET    /discount-codes     All codes
POST   /discount-codes     Create code
```

### Misc
```
POST   /api/newsletter/subscribe    Subscribe {email, name?}
POST   /api/newsletter/unsubscribe  Unsubscribe {email}
POST   /api/discount/validate       Validate code {code, cart_total}
GET    /health                      Health check
```

---

## Database Schema (11 tables)

```
users                  id, name, email, password_hash, role, phone
addresses              id, user_id, label, full_name, phone, line1..zip, is_default
categories             id, slug, name, sort_order
products               id, sku, name, slug, price, compare_price, emoji, badge, featured, is_active
product_variants       id, product_id, size, color, color_hex, stock
product_images         id, product_id, url, is_primary
cart_items             id, user_id, variant_id, quantity
orders                 id, order_number, user_id, status, payment_status, total, shipping_*
order_items            id, order_id, product_id, variant_id, price, quantity
reviews                id, product_id, user_id, rating, body, verified, approved
newsletter_subscribers id, email, name, subscribed
discount_codes         id, code, type, value, min_order, max_uses, expires_at
```

---

## What's Ready vs Next Steps

### ✅ Fully working out of the box
- User registration + login (JWT)
- Product listing, filtering, pagination
- Server-side cart with stock validation
- Guest checkout (COD)
- Order placement with stock deduction + rollback on failure
- Discount codes (% and fixed)
- Newsletter subscribe/unsubscribe
- Admin dashboard stats
- Review submission + moderation
- Rate limiting, CORS, helmet security headers
- Auto-deploy on GitHub push

### 🔜 Next steps to add
- **PayMongo** — GCash / Maya / card payments (PH-local)
- **Admin UI page** — HTML dashboard using the `/api/admin/*` endpoints
- **Email** — order confirmation via Nodemailer + Gmail SMTP or Resend
- **Product images** — Multer upload + Cloudinary CDN
- **Checkout page** — dedicated `/checkout` with address form + payment
- **Order tracking** — `/orders/:number` status timeline page
