# E-Shop — Mentor Setup Guide

**Repository:** https://github.com/Mayank99711/E-shop  
**Branch containing the latest reviewed changes:** `refactor/frontend-feature-architecture`  
**Verified commit:** `4c6bf22` (November 11, 2026)

## 1. Overview

E-Shop is a full-stack multi-role e-commerce application with Customer, Shop Owner, Shop Employee, and Super Admin portals. Its stack is React 19 + Vite 6, Node.js + Express 5, PostgreSQL and Prisma 6. The current feature branch includes product variants (including images), customer shopping improvements, employee management, and order/returns updates.

## 2. Prerequisites

Install:

- **Git**
- **Node.js** (Node.js 22 LTS recommended) and npm
- **PostgreSQL** (local server running and a database account with permission to create a database)
- A code editor such as VS Code (optional)

Verify in PowerShell or a terminal:

```bash
git --version
node --version
npm --version
psql --version
```

## 3. Clone the *correct* branch

```bash
git clone -b refactor/frontend-feature-architecture https://github.com/Mayank99711/E-shop.git
cd E-shop
```

**Important:** The latest mentor-demo changes were pushed to the feature branch above, **not** necessarily to `main`.

## 4. Create a local PostgreSQL database

Create a blank database named `eshop`. For example, if `psql` is available and you use PostgreSQL's `postgres` account:

```bash
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE eshop;"
```

PostgreSQL may prompt for the local user's password. If the DB already exists, skip this command. You can also create `eshop` through pgAdmin. **Do not use an existing database containing important data** for this demo setup.

## 5. Configure backend environment

In the project root, copy the provided backend template to `backend/.env`.

**PowerShell:**

```powershell
Copy-Item backend\.env.example backend\.env
```

**macOS/Linux:**

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and replace the following values:

- `DATABASE_URL`: use **your own** PostgreSQL username, password, port, and `eshop` database name.
- `SESSION_SECRET`: use a unique, securely generated random secret **at least 32 characters** long.
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`: choose test admin credentials **only if** you plan to seed an initial Super Admin. Password must be at least 12 characters.

The backend defaults to port **4000** and accepts frontend origin **http://localhost:5173**. SMTP, Razorpay, and tax settings are optional for basic startup, but dependent workflows (e.g., registration emails or online payments) require working provider configuration.

> Never push a real `.env` file to GitHub or send it in a public message. The repository's `.gitignore` excludes `.env` and permits `.env.example` templates.

## 6. Install and prepare the backend

Open a terminal in the project root:

```bash
cd backend
npm install
npm run prisma:generate
npm run db:validate
npm run db:deploy
```

`db:deploy` applies the committed Prisma migrations to the **new local database**. Ensure the `DATABASE_URL` is correct before running any migration.

### Optional: create initial Super Admin user

If the database is new and `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` are filled in with valid private values in `backend/.env`, run **once**:

```bash
npm run db:seed
```

The seeder fails if that email already exists; it does not update existing users. The seed script creates the initial **Super Admin only**, not a fully populated demonstration catalog or existing shop/customer records.

### Start the API

```bash
npm run dev
```

Expected backend URL: **http://localhost:4000**  
Check in browser: **http://localhost:4000/api/health**

Keep this terminal running.

## 7. Configure and start the frontend

In a **second terminal**, go to the project root, then:

```bash
cd frontend
npm install
```

The provided `frontend/.env.example` is informational because **no frontend environment variables are required** for the current local development setup. If a mentor specifically requests both `.env` files, copy it:

**PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS/Linux:**

```bash
cp .env.example .env
```

Start the frontend:

```bash
npm run dev
```

Open **http://localhost:5173**. Vite's configuration proxies calls beginning with `/api` to **http://localhost:4000**.

## 8. Functional smoke test

1. Confirm `/api/health` responds successfully.
2. Open the Customer portal at `http://localhost:5173`.
3. Log in with the **new** Super Admin account, if you ran the seed; use the Admin portal at `http://localhost:5173/admin`.
4. Create or activate a demo shop/owner account through the supported UI workflow (email-based activation may require SMTP configuration).
5. Use Shop Owner features to create a product with Color/Size variants and variant-specific images.
6. Check that the Customer view shows the correct variant image, price and stock, then test cart and order flows with the available demo data.
7. Verify employee details/permissions in the Owner and Super Admin portals.

**Data note:** A fresh clone and a fresh database will **not** automatically reproduce the original developer's local accounts, products, uploaded photos, or complete demo dataset. Runtime product images under `backend/uploads/` are ignored by Git. Arrange safe demo seed data and image assets separately if identical sample screens are required.

## 9. Build and validation

**Frontend:**

```bash
cd frontend
npm run build
```

**Backend:**

```bash
cd backend
npm run db:validate
```

Frontend build and Prisma schema validation were confirmed successful on the developer's machine for commit `4c6bf22`. Full mentor-machine installation and end-to-end tests must still be performed on the destination machine.

## 10. Common setup issues

| Symptom | What to check |
|---|---|
| Prisma/database connection error | PostgreSQL is running, `eshop` exists, and `DATABASE_URL` credentials/port are correct |
| `SESSION_SECRET` validation error | It must contain at least 32 characters |
| Frontend fetch/API error | Backend port 4000 is running and Vite proxy remains configured |
| Port already in use | Stop the other process or update both port and relevant frontend/backend configuration |
| Fresh database has no products/users | Seed initial Super Admin, then prepare demo records separately |
| Registration/activation email fails | Configure all five SMTP settings in the backend `.env` with valid provider credentials |
| Razorpay checkout cannot complete | Payment provider test credentials and applicable workflow configuration are required |
| Product images appear missing | Previously uploaded runtime files are not included in the Git repository |

## 11. Security and sharing

- **Share these files:** `backend/.env.example`, `frontend/.env.example`, `SETUP_GUIDE.md`.
- **Do not share:** actual `.env` credentials, live service API keys, real database contents, personally identifiable customer records, or payment secrets.
- If the mentor must use external services, arrange separate **sandbox credentials** through a private, approved channel and rotate them as needed.

## 12. Repository verification

```bash
git branch --show-current
git log -1 --oneline
```

For the reviewed snapshot, branch should be `refactor/frontend-feature-architecture` and its commit should include `4c6bf22` (or a newer commit if templates and this guide are subsequently added).
