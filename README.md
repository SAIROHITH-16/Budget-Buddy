# 💰 Budget Buddy

**AI-Powered Personal Finance Tracker**

> A modern, full-stack web application for tracking personal finances — with intelligent transaction categorisation, money-lending tracking, budget management, and spending insights. Built with React, TypeScript, Supabase, and Firebase Auth.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-budgetbuddy1.vercel.app-6d28d9?style=flat-square&logo=vercel)](https://budgetbuddy1.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-SAIROHITH--16-181717?style=flat-square&logo=github)](https://github.com/SAIROHITH-16)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Sai%20Rohith%20Dachepalli-0A66C2?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/dachepalli-sairohith-44968a2a5/)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-039BE5?style=flat-square&logo=Firebase&logoColor=white)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 **Authentication** | Email/password, Google sign-in, and phone OTP via Firebase Auth |
| 📊 **Dashboard** | Real-time stat cards (income, expenses, wallet balance, money lending) with four interactive charts |
| 💸 **Transactions** | Add, edit, delete, and filter transactions by type, category, and date range |
| 🤝 **Money Lending** | Track loans given to friends with borrower name, due date, and repayment status (Pending / Partial / Repaid / Overdue) |
| 📂 **CSV / PDF Import** | Upload bank statements with smart column mapping, deduplication, and encrypted-PDF support |
| 🤖 **AI Categorisation** | Automatic transaction categorisation via Supabase Edge Functions (primary) and Express backend (fallback) |
| 📈 **Insights** | Monthly trends, category breakdowns, and income vs expense analysis |
| 🎯 **Budget Settings** | Set per-category monthly spending limits with real-time progress tracking |
| 💱 **Multi-Currency** | Switch display currency with a persistent preference |
| ☀️ **Aurora Light Theme** | Soft pastel gradient UI with glassmorphism cards |
| 📱 **Responsive Design** | Fully responsive with a collapsible sidebar for mobile and desktop |
| 🔒 **Row-Level Security** | Supabase RLS ensures every user sees only their own data |

---

## 🛠️ Tech Stack

### Frontend
- **React 18** + **TypeScript** — component-based UI
- **Vite** — lightning-fast dev server and build tool
- **Tailwind CSS** — utility-first styling with a custom aurora theme
- **shadcn/ui** + **Radix UI** — accessible component primitives
- **Recharts** — interactive data visualisations (bar, line, pie charts)
- **React Router v6** — client-side routing with protected routes
- **React Hook Form** + **Zod** — form state management and validation
- **Axios** — HTTP client with automatic Firebase token injection

### Backend
- **Node.js** + **Express** — RESTful API server (hosted on Render)
- **Supabase (PostgreSQL)** — primary database with Row-Level Security
- **Firebase Admin SDK** — server-side JWT verification middleware
- **Multer** + **pdf-parse** — file upload and PDF text extraction

### Auth & Cloud
- **Firebase Authentication** — email/password, Google OAuth, phone OTP
- **Supabase Edge Functions** — serverless AI categorisation pipeline
- **Vercel** — frontend hosting with SPA rewrite rules

---

## 📁 Project Structure

```
Budget-Buddy/
├── src/                          # Frontend (React + TypeScript)
│   ├── pages/
│   │   ├── Landing.tsx           # Public landing page
│   │   ├── Login.tsx             # Sign-in
│   │   ├── Register.tsx          # Sign-up
│   │   ├── Dashboard.tsx         # Stat cards + charts
│   │   ├── Transactions.tsx      # Transaction list + filters
│   │   ├── Insights.tsx          # Analytics & trends
│   │   ├── Settings.tsx          # Account & budget settings
│   │   ├── ReviewQueue.tsx       # Imported tx review queue
│   │   ├── About.tsx             # About the project
│   │   └── ForgotPassword.tsx    # Password reset
│   ├── components/
│   │   ├── charts/               # Recharts visualisations
│   │   ├── ui/                   # shadcn/ui primitives
│   │   ├── TransactionForm.tsx   # Add transaction (grouped type selector)
│   │   ├── TransactionEditModal.tsx
│   │   ├── CsvImporter.tsx       # CSV / PDF import flow
│   │   ├── BudgetSettings.tsx    # Per-category budget limits
│   │   ├── ErrorBoundary.tsx     # Top-level crash catcher
│   │   └── ...
│   ├── context/
│   │   └── AuthContext.tsx       # Firebase auth state & helpers
│   ├── hooks/
│   │   ├── useTransactions.ts    # Fetch / mutate transactions
│   │   └── useInsights.ts        # Fetch aggregated insights
│   ├── integrations/supabase/    # Supabase client + generated types
│   ├── utils/
│   │   └── calculations.ts       # Balance, income/expense helpers
│   ├── api.ts                    # Axios instance with auth interceptor
│   └── firebase.ts               # Firebase client SDK config
│
├── server/                       # Backend (Node.js + Express → Render)
│   ├── index.js                  # Express entry point
│   ├── firebaseAdmin.js          # Firebase Admin SDK init
│   ├── routes/
│   │   ├── transactions.js       # CRUD + CSV import (dedup via Supabase)
│   │   ├── budget.js             # Budget limits CRUD
│   │   ├── insights.js           # Aggregated insights + AI categorisation
│   │   ├── parsePdf.js           # PDF statement parsing
│   │   └── users.js              # User profile
│   ├── middleware/
│   │   └── verifyToken.js        # Firebase JWT verification
│   └── lib/
│       ├── db.js                 # Supabase client (service-role)
│       ├── categorize.js         # AI categorisation logic
│       └── mailer.js             # Email notifications
│
└── supabase/
    ├── migrations/               # SQL migrations (run in Supabase SQL editor)
    └── functions/
        ├── categorize/           # Edge Function: AI tx categorisation
        ├── analyze/              # Edge Function: spending analysis
        └── parse-statement/      # Edge Function: bank statement parsing
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v18+
- **npm** or **bun**
- A **Firebase** project (Authentication enabled — Email/Password, Google, Phone)
- A **Supabase** project (PostgreSQL database)

### 1 · Clone the Repository

```bash
git clone https://github.com/SAIROHITH-16/Budget-Buddy.git
cd Budget-Buddy
```

### 2 · Frontend Setup

```bash
npm install
```

Create `.env` in the project root:

```env
# Firebase client config (Firebase Console → Project Settings → Web App)
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Supabase (Project Settings → API)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_public_key
```

### 3 · Backend Setup

```bash
cd server
npm install
```

Create `server/.env`:

```env
PORT=3001
CORS_ORIGIN=http://localhost:8080

# Supabase service-role key (bypasses RLS for server-side operations)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# GitHub Models / OpenAI key for AI categorisation (optional)
GITHUB_TOKEN=your_github_models_token
```

Place your Firebase Admin service account JSON at `server/serviceAccountKey.json`.

### 4 · Run the Application

**Terminal 1 — Backend:**
```bash
cd server
node index.js
# API on http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
npm run dev
# App on http://localhost:8080
```

---

## 📜 Available Scripts

### Frontend
| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest unit tests |

### Backend
| Command | Description |
|---|---|
| `node index.js` | Start the API server |
| `nodemon index.js` | Start with auto-reload (dev) |

---

## 🗄️ Database

Budget Buddy uses **Supabase (PostgreSQL)** as the primary database with Row-Level Security (RLS) policies ensuring strict user data isolation.

| Table | Description |
|---|---|
| `users` | Firebase UID, name, email, phone number |
| `transactions` | All income / expense / lending records per user |
| `budgets` | Per-category monthly spending limits |
| `loans` | Loan tracking with borrower, due date, and status |

---

## 🔌 API Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | — | Server health check |
| POST | `/api/users/profile` | — | Create / update user profile |
| GET | `/api/users/profile` | ✅ | Get current user's profile |
| GET | `/api/transactions` | ✅ | List transactions (with filters & pagination) |
| POST | `/api/transactions` | ✅ | Create a transaction |
| PUT | `/api/transactions/:id` | ✅ | Update a transaction |
| DELETE | `/api/transactions/:id` | ✅ | Delete a transaction |
| POST | `/api/transactions/import` | ✅ | Bulk import with content-based deduplication |
| GET | `/api/insights` | ✅ | Aggregated financial insights |
| POST | `/api/insights/categorize` | ✅ | AI-categorise a transaction description |
| GET | `/api/budget` | ✅ | Get budget limits |
| POST | `/api/budget` | ✅ | Save budget limits |
| POST | `/api/parse-pdf` | ✅ | Upload & parse a PDF bank statement |

---

## 🔒 Security

- Firebase JWT verified on every protected route via `verifyToken` middleware
- Supabase RLS policies enforce per-user data isolation at the database level
- Service-role key used server-side only — never exposed to the client
- CORS restricted to configured origins
- All secrets stored in `.env` files (excluded from version control)
- Zod schemas validate all form inputs on the client

---

## 🧪 Testing

```bash
npm test            # run Vitest once
npm run test:watch  # run in watch mode
```

---

## 🚢 Deployment

| Layer | Platform | Notes |
|---|---|---|
| Frontend | **Vercel** | Auto-deploys on push to `main`; set all `VITE_*` env vars in project settings |
| Backend | **Render** | Set `SUPABASE_*`, `GITHUB_TOKEN`, and Firebase service account env vars |
| Database | **Supabase** | Run migrations in SQL Editor; Edge Functions deploy via Supabase CLI |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 👤 Developer

**Sai Rohith Dachepalli**  
Computer Science & Engineering (AI & ML) · Vardhaman College of Engineering

[![GitHub](https://img.shields.io/badge/GitHub-SAIROHITH--16-181717?logo=github)](https://github.com/SAIROHITH-16)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?logo=linkedin)](https://www.linkedin.com/in/dachepalli-sairohith-44968a2a5/)

---

## 🙏 Acknowledgments

- **shadcn/ui** for beautiful, accessible components
- **Recharts** for a flexible charting solution
- **Firebase** for authentication infrastructure
- **Supabase** for the managed PostgreSQL database and Edge Functions


---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 **Authentication** | Email/password and Google sign-in via Firebase Auth. Log in with **email or phone number**. |
| 📊 **Dashboard** | Real-time stat cards (income, expenses, balance) with four interactive charts |
| 💸 **Transactions** | Add, edit, delete, filter, and search transactions by type, category, and date |
| 📂 **CSV / PDF Import** | Upload bank statements with smart column mapping and encrypted-PDF support |
| 🤖 **AI Categorization** | Automatic categorisation using GitHub Models / OpenAI API |
| 📈 **Insights** | Monthly trends, category breakdowns, and income vs expense analysis |
| 🎯 **Budget Settings** | Set per-category spending limits and track usage in real time |
| 💱 **Multi-Currency** | Switch display currency with persistent preference |
| ☀️ **Aurora Light Theme** | Soft pastel gradient UI with glassmorphism cards (violet / emerald / rose / amber palette) |
| 📱 **Responsive Design** | Fully responsive with collapsible sidebar for mobile and desktop |
| ⚙️ **Settings** | Manage display name, view email & phone, change password, set currency and budgets |

---

## 🛠️ Tech Stack

### Frontend
- **React 18** + **TypeScript** — component-based UI
- **Vite** — lightning-fast dev server and build tool
- **Tailwind CSS** — utility-first styling with custom aurora light theme
- **shadcn/ui** + **Radix UI** — accessible, unstyled component primitives
- **Recharts** — interactive data visualisations (bar, line, pie charts)
- **React Router v6** — client-side routing with protected routes
- **Axios** — HTTP client with automatic Firebase token injection

### Backend
- **Node.js** + **Express** — RESTful API server
- **better-sqlite3** — embedded, zero-config SQLite database
- **Firebase Admin SDK** — server-side JWT verification middleware
- **Multer** + **pdf-parse** — file upload and PDF text extraction

### Auth & Cloud
- **Firebase Authentication** — email/password and Google OAuth
- **GitHub Models / OpenAI API** — AI transaction categorisation
- **Supabase Edge Functions** — serverless AI analysis pipeline

---

## 📁 Project Structure

```
budget-buddy/
├── src/                          # Frontend (React + TypeScript)
│   ├── pages/
│   │   ├── Landing.tsx           # Public landing page
│   │   ├── Login.tsx             # Sign-in (email or phone number)
│   │   ├── Register.tsx          # Sign-up with country-code phone validation
│   │   ├── Dashboard.tsx         # Main dashboard with charts
│   │   ├── Transactions.tsx      # Transaction management
│   │   ├── Insights.tsx          # Analytics & trends
│   │   ├── Settings.tsx          # Account & budget settings
│   │   ├── About.tsx             # About the project & developer
│   │   └── ForgotPassword.tsx    # Password reset
│   ├── components/
│   │   ├── charts/               # Recharts visualisations
│   │   ├── ui/                   # shadcn/ui primitives
│   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   ├── Navbar.tsx            # Top navigation bar
│   │   ├── ProfileSettings.tsx   # Profile card (name, email, phone)
│   │   ├── BudgetSettings.tsx    # Budget limits card
│   │   ├── CsvImporter.tsx       # CSV / PDF import flow
│   │   └── TransactionForm.tsx   # Add / edit transaction form
│   ├── context/
│   │   └── AuthContext.tsx       # Firebase auth context & hooks
│   ├── hooks/                    # Custom React hooks
│   ├── api.ts                    # Axios instance with auth interceptor
│   └── firebase.ts               # Firebase client SDK config
│
└── server/                       # Backend (Node.js + Express)
    ├── index.js                  # Express app entry point
    ├── firebaseAdmin.js          # Firebase Admin SDK initialisation
    ├── routes/
    │   ├── transactions.js       # CRUD transactions
    │   ├── budget.js             # Budget limits CRUD
    │   ├── insights.js           # Aggregated insights queries
    │   ├── parsePdf.js           # PDF statement parsing
    │   └── users.js              # User profile + phone-to-email lookup
    ├── middleware/
    │   └── verifyToken.js        # Firebase JWT verification
    └── lib/
        ├── db.js                 # SQLite connection helper
        ├── categorize.js         # AI categorisation logic
        └── dataApi.js            # Data access layer
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v18 or later
- **npm** or **bun**
- A **Firebase** project with Authentication enabled (Email/Password + Google)
- A **Firebase Admin** service account JSON key

### 1 · Clone the Repository

```bash
git clone https://github.com/SAIROHITH-16/Budget-Buddy.git
cd Budget-Buddy
```

### 2 · Frontend Setup

```bash
npm install
```

Create a `.env` file in the project root:

```env
VITE_API_URL=http://localhost:3001/api

# Firebase client config (Firebase Console → Project Settings → Web App)
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3 · Backend Setup

```bash
cd server
npm install
```

Create `server/.env`:

```env
PORT=3001
CORS_ORIGIN=http://localhost:8081

# GitHub Models / OpenAI key for AI categorisation (optional)
GITHUB_TOKEN=your_github_models_token
```

Place your Firebase Admin service account JSON at `server/serviceAccountKey.json`.

### 4 · Run the Application

**Terminal 1 — Backend:**
```bash
cd server
node index.js
# API server starts on http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
npm run dev
# App starts on http://localhost:8081
```

Open [http://localhost:8081](http://localhost:8081).

---

## 📜 Available Scripts

### Frontend
| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest unit tests |

### Backend
| Command | Description |
|---|---|
| `node index.js` | Start the server |
| `nodemon index.js` | Start with auto-reload (dev) |

---

## 🗄️ Database

Budget Buddy uses **SQLite** via `better-sqlite3` — zero configuration, no external service required. The `budget.db` file is created automatically in `server/` on first run.

| Table | Description |
|---|---|
| `users` | Firebase UID, name, email, phone number |
| `transactions` | All income / expense records per user |
| `budgets` | Per-category spending limits per user |

---

## 🔌 API Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | — | Server health check |
| POST | `/api/users/profile` | — | Create / update user profile |
| GET | `/api/users/profile` | ✅ | Get current user's profile |
| GET | `/api/users/lookup-by-phone?phone=` | — | Resolve phone number → email |
| GET | `/api/transactions` | ✅ | List all transactions |
| POST | `/api/transactions` | ✅ | Create transaction |
| PUT | `/api/transactions/:id` | ✅ | Update transaction |
| DELETE | `/api/transactions/:id` | ✅ | Delete transaction |
| GET | `/api/insights` | ✅ | Aggregated financial insights |
| GET | `/api/budget` | ✅ | Get budget limits |
| POST | `/api/budget` | ✅ | Save budget limits |
| POST | `/api/parse-pdf` | ✅ | Upload & parse PDF bank statement |

---

## 🔒 Security

- Firebase JWT verified on every protected API route via `verifyToken` middleware
- CORS restricted to `localhost` and private LAN IP ranges only
- Phone numbers stored as digits only; looked up server-side (never exposed in URLs)
- All secrets kept in `.env` files (excluded from version control)

---

## 🧪 Testing

```bash
npm test           # run Vitest once
npm run test:watch # run in watch mode
```

---

## 📦 Production Build

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build locally
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 👤 Developer

**Sai Rohith Dachepalli**  
Computer Science & Engineering (AI & ML) · Vardhaman College of Engineering

[![GitHub](https://img.shields.io/badge/GitHub-SAIROHITH--16-181717?logo=github)](https://github.com/SAIROHITH-16)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?logo=linkedin)](https://www.linkedin.com/in/dachepalli-sairohith-44968a2a5/)
## 🏗️ Project Structure

```
budget-buddy/
├── src/                      # Frontend source
│   ├── components/          # React components
│   │   ├── charts/         # Chart components
│   │   └── ui/             # shadcn/ui components
│   ├── context/            # React Context providers
│   ├── hooks/              # Custom React hooks
│   ├── pages/              # Page components
│   ├── utils/              # Utility functions
│   ├── App.tsx             # Root component
│   └── main.tsx            # Entry point
├── server/                  # Backend source
│   ├── lib/                # Core logic
│   │   ├── dataApi.js     # Data access layer
│   │   ├── categorize.js  # AI categorization
│   │   └── db.js          # Database connection
│   ├── middleware/         # Express middleware
│   ├── models/            # Mongoose schemas
│   ├── routes/            # API route handlers
│   └── index.js           # Express app entry
└── supabase/               # Supabase Functions
    └── functions/
        ├── analyze/       # Transaction analysis
        └── categorize/    # AI categorization
```

---

## 🔒 Security Features

- **Firebase Authentication**: Secure user authentication with industry-standard OAuth
- **JWT Middleware**: Protected API endpoints with token verification
- **Environment Variables**: Sensitive credentials stored securely
- **CORS Configuration**: Controlled cross-origin resource sharing
- **Input Validation**: Zod schemas for form validation
- **Password Reset**: Secure password recovery flow

---

## 📊 API Endpoints

### Authentication
- `POST /api/verify-token` - Verify Firebase ID token

### Transactions
- `GET /api/transactions` - Get all user transactions
- `POST /api/transactions` - Create a new transaction
- `PUT /api/transactions/:id` - Update a transaction
- `DELETE /api/transactions/:id` - Delete a transaction

### Budgets
- `GET /api/budgets` - Get user budgets
- `POST /api/budgets` - Create/update budgets

### Insights
- `GET /api/insights` - Get spending insights and analytics

---

## 🧪 Testing

```bash
# Run test suite
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 🚢 Deployment

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

The build output will be in the `dist/` directory.

---

## 🤝 Contributing

This is a portfolio project, but feedback and suggestions are welcome! Feel free to open an issue or submit a pull request.

---

## 📄 License

MIT License - feel free to use this code for your own learning and projects.

---

## 👨‍💻 Developer

Built as a portfolio project to demonstrate full-stack TypeScript development, modern React patterns, and cloud service integration.

**Key Learnings:**
- End-to-end TypeScript application architecture
- Firebase Authentication integration
- MongoDB schema design and data modeling
- RESTful API design principles
- Modern React patterns (hooks, context, suspense)
- AI API integration for real-world features
- Responsive UI/UX with Tailwind CSS

---

## 🙏 Acknowledgments

- **shadcn/ui** for beautiful, accessible components
- **Recharts** for flexible charting solution
- **Firebase** for authentication infrastructure
- **MongoDB Atlas** for managed database hosting
