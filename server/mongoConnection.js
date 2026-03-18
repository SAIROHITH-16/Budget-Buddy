// server/mongoConnection.js
// MongoDB connection setup using Mongoose.
// Full manual implementation — no template, no scaffold.
//
// This file handles the MongoDB connection lifecycle:
//   - Connects to MongoDB Atlas using the MONGODB_URI from .env
//   - Configures Mongoose connection settings
//   - Handles connection events (connected, error, disconnected)
//
// Import this file in server/index.js as a side-effect to establish the connection:
//   require("./mongoConnection");

"use strict";

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// 1. Read MongoDB URI from environment variables
// ---------------------------------------------------------------------------
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("[MongoDB] MONGODB_URI environment variable is not defined.");
  console.error("[MongoDB] Please add MONGODB_URI to your .env file.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Mongoose connection options
//    Modern Mongoose versions (6+) have sensible defaults, but we explicitly
//    set a few options for clarity and production readiness.
// ---------------------------------------------------------------------------
const mongooseOptions = {
  // Automatically create indexes defined in schemas
  autoIndex: true,

  // Server selection timeout (how long to wait for MongoDB to respond)
  // FAILS FAST IN 5 SECONDS instead of hanging for 30s
  serverSelectionTimeoutMS: 5000,

  // Socket timeout (how long a send or receive on a socket can take)
  socketTimeoutMS: 45000,  // 45 seconds

  // Connection pool settings
  maxPoolSize: 10,
  minPoolSize: 2,

  // Retry writes
  retryWrites: true,

  // Retry reads
  retryReads: true,
};

// ---------------------------------------------------------------------------
// 3. Connect to MongoDB
//    mongoose.connect() is asynchronous but we don't await it here.
//    Connection events are handled below.
// ---------------------------------------------------------------------------
mongoose.connect(MONGODB_URI, mongooseOptions)
  .then(() => {
    console.log("[MongoDB] Connected successfully to MongoDB Atlas");
    console.log(`[MongoDB] Database: ${mongoose.connection.name}`);
  })
  .catch((err) => {
    console.error("\n❌ [MongoDB] FATAL: INITIAL CONNECTION FAILED ❌");
    console.error("Error Message:", err.message);
    console.error("\n--- 🔍 DIAGNOSTICS 🔍 ---");
    if (err.message.includes('IP') || err.message.includes('whitelist') || err.message.includes('bad auth')) {
      console.error("👉 IP WHITELISTING ISSUE: This server's IP address is not whitelisted in MongoDB Atlas.");
      console.error("👉 FIX: Go to Atlas -> Security -> Network Access -> Add IP Address -> Add 0.0.0.0/0");
    } else if (err.message.includes('authentication') || err.message.includes('auth')) {
      console.error("👉 AUTHENTICATION ISSUE: Invalid username or password in MONGODB_URI.");
      console.error("👉 FIX: Check Database Access settings in Atlas and verify credentials in Render dashboard.");
    } else if (err.message.includes('timeout') || err.message.includes('ETIMEOUT')) {
      console.error("👉 TIMEOUT ISSUE: Cannot reach the database cluster.");
      console.error("👉 FIX: Verify cluster is ACTIVE, and verify IP is whitelisted (0.0.0.0/0).");
    } else {
      console.error("👉 UNKNOWN ISSUE: Check if URI is perfectly formatted.");
    }
    console.error("--------------------------\n");
    // Don't exit — let the app continue, but log the error clearly
  });

// ---------------------------------------------------------------------------
// 4. Connection event listeners
//    These run throughout the application lifecycle.
// ---------------------------------------------------------------------------

// Connection established successfully
mongoose.connection.on("connected", () => {
  console.log("[MongoDB] Mongoose connected to:", mongoose.connection.host);
});

// Connection error after initial connection
mongoose.connection.on("error", (err) => {
  console.error("[MongoDB] Connection error:", err.message);
});

// Connection lost
mongoose.connection.on("disconnected", () => {
  console.warn("[MongoDB] Mongoose disconnected from MongoDB");
});

// Graceful shutdown on process termination
process.on("SIGINT", async () => {
  try {
    await mongoose.connection.close();
    console.log("[MongoDB] Connection closed due to app termination (SIGINT)");
    process.exit(0);
  } catch (err) {
    console.error("[MongoDB] Error closing connection:", err);
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
  try {
    await mongoose.connection.close();
    console.log("[MongoDB] Connection closed due to app termination (SIGTERM)");
    process.exit(0);
  } catch (err) {
    console.error("[MongoDB] Error closing connection:", err);
    process.exit(1);
  }
});

// ---------------------------------------------------------------------------
// 5. Export the mongoose instance (optional)
//    Mostly used as a side-effect import, but exporting allows other files
//    to check connection state if needed.
// ---------------------------------------------------------------------------
module.exports = mongoose;
