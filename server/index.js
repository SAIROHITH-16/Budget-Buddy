// server/index.js
// Express server — uses Firebase Firestore (HTTPS/443) via Admin SDK.
// Database is always reachable: no retry loops, no port-27017 dependency.

"use strict";

require("dotenv").config();

const express = require("express");
const cors    = require("cors");

// Initialise Firebase Admin SDK (side-effect import)
require("./firebaseAdmin");

// Route handlers
const transactionRoutes = require("./routes/transactions");
const insightsRoutes    = require("./routes/insights");
const budgetRoutes      = require("./routes/budget");
const parsePdfRoutes    = require("./routes/parsePdf");
const userRoutes        = require("./routes/users");

const PORT        = Number(process.env.PORT) || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN  || "http://localhost:5173";

const app = express();

// ---- Middleware ----
// Allow any localhost, 127.x, or private-network (192.168.x / 10.x / 172.16-31.x)
// origin so the app works whether opened via localhost or by LAN IP address.
const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl/Postman) and any local/LAN origin
    if (!origin || LOCAL_ORIGIN_RE.test(origin)) return cb(null, true);
    // Unknown origin — reject cleanly (false, not an Error, to avoid 500)
    cb(null, false);
  },
  methods:        ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials:    false,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ---- Routes ----
app.use("/api/transactions", transactionRoutes);
app.use("/api/insights",     insightsRoutes);
app.use("/api/budget",       budgetRoutes);
app.use("/api/parse-pdf",    parsePdfRoutes);
app.use("/api/users",        userRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", db: "sqlite", timestamp: new Date().toISOString() });
});


// ---- 404 ----
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

// ---- Global error handler ----
// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, _next) => {
  console.error("[Express error handler]", error);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || "Internal server error.",
  });
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
  console.log(`[server] Health: http://localhost:${PORT}/health`);
});

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT",  () => process.exit(0));

