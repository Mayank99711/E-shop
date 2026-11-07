# E-Shop — Full-Stack E-Commerce Application

E-Shop is a full-stack e-commerce application built with React, Node.js, Express, PostgreSQL, and Prisma.

It includes role-based portals for Customers, Shop Owners, Shop Employees, and Super Admins.

## Technology Stack

**Frontend:** React, Vite, JavaScript, React Router

**Backend:** Node.js, Express.js

**Database:** PostgreSQL with Prisma ORM

**Security and Validation:** Express Session, bcryptjs, Helmet, Express Rate Limit, Zod

## Application Features

- **Customer Portal:** Browse products, search, filter categories, view product details, and use shopping features.
- **Shop Owner Portal:** Manage products, inventory, orders, employees, and shop operations.
- **Shop Employee Portal:** Access authorized shop-management features based on assigned roles and permissions.
- **Super Admin Portal:** Manage platform operations, shops, catalogs, and account requests.

## Project Structure

```text
E-shop/
├── backend/
│   ├── prisma/
│   ├── src/
│   ├── tests/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   ├── customer/
│   │   │   ├── employee/
│   │   │   └── shop-owner/
│   │   ├── components/
│   │   ├── pages/
│   │   └── routes/
│   ├── tests/
│   └── package.json
└── README.md
```

## Prerequisites

- Node.js and npm
- PostgreSQL
- Git

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/Mayank99711/E-shop.git
cd E-shop
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Configure the required backend environment variables, including PostgreSQL connectivity, using your local project configuration. Never commit credentials.

```bash
npm run prisma:generate
npm run db:validate
npm run db:migrate
npm run dev
```

Run migrations only against your intended development database.

### 3. Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend development URL: http://localhost:5173

## Testing

### Frontend

```bash
cd frontend
npm run build
npm test
```

Latest local verification: **12/12 browser smoke tests passed**, and production build passed.

### Backend

```bash
cd backend
npm test
```

Configure an isolated test database as required by the project's test safety guard. Backend tests have not yet been verified during this review.

## Project Status

- Frontend feature restructuring: Completed
- Frontend build: Passed
- Browser smoke tests: 12/12 Passed
- Backend and database verification: Pending
- Production deployment: Pending

## GitHub Repository

https://github.com/Mayank99711/E-shop
