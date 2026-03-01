#!/usr/bin/env node
// server/setup-data-api.js
// Run this after filling in ATLAS_APP_ID and ATLAS_DATA_API_KEY in server/.env
// to verify the Data API connection is working.
//
// Usage:  node setup-data-api.js

"use strict";
require("dotenv").config();

const APP_ID  = process.env.ATLAS_APP_ID;
const API_KEY = process.env.ATLAS_DATA_API_KEY;
const DB      = process.env.ATLAS_DB_NAME    || "budget-buddy";
const DS      = process.env.ATLAS_DATA_SOURCE || "Cluster0";

if (!APP_ID || !API_KEY) {
  console.error("\n❌  Missing credentials in server/.env\n");
  console.error("    ATLAS_APP_ID      =", APP_ID  || "(empty)");
  console.error("    ATLAS_DATA_API_KEY=", API_KEY ? "*** (set)" : "(empty)");
  console.error("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.error("  How to get these values:");
  console.error("  1. Go to  https://cloud.mongodb.com");
  console.error("  2. Top nav → App Services  (create an app if prompted)");
  console.error("  3. Left sidebar → HTTPS Endpoints → Data API → Enable");
  console.error("  4. Copy the App ID shown at the top  (starts with 'data-')");
  console.error("  5. Click 'Generate API Key', copy the key");
  console.error("  6. Paste both into server/.env, then run:  node setup-data-api.js");
  console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(1);
}

const url = `https://data.mongodb-api.com/app/${APP_ID}/endpoint/data/v1/action/find`;

console.log("\n🔌  Testing Atlas Data API connection over HTTPS (port 443)...");
console.log("    App ID     :", APP_ID);
console.log("    Database   :", DB);
console.log("    Data Source:", DS);
console.log("    URL        :", url);
console.log();

fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", "api-key": API_KEY },
  body: JSON.stringify({
    dataSource: DS,
    database:   DB,
    collection: "transactions",
    filter:     {},
    limit:      1,
  }),
})
  .then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      const count = body.documents?.length ?? 0;
      console.log("✅  Connection successful!");
      console.log(`    Found ${count} document(s) in 'transactions' collection.`);
      console.log("\n    Your server is ready. Start it with:");
      console.log("    cd server && node index.js\n");
    } else {
      console.error("❌  Data API returned HTTP", res.status);
      console.error("    Response:", JSON.stringify(body, null, 2));
      if (res.status === 404) {
        console.error("\n    The App ID may be wrong, or the Data API may not be enabled yet.");
        console.error("    Make sure you enabled the Data API in App Services → HTTPS Endpoints.");
      }
      if (res.status === 401) {
        console.error("\n    The API key is wrong or expired. Generate a new one in App Services.");
      }
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("❌  Network error:", err.message);
    process.exit(1);
  });
