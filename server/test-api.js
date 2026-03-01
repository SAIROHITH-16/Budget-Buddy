// server/test-api.js
// Automated end-to-end API test script.
//
// What it does:
//   1. Uses Firebase Admin to mint a custom token for a test user.
//   2. Exchanges the custom token for a real Firebase ID token via REST.
//   3. Runs GET, POST, PUT, DELETE against the live /api/transactions endpoint.
//   4. Prints pass/fail for each step with colour-coded output.
//
// Run: node test-api.js   (from the server/ directory)

"use strict";

const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require("dotenv").config();
const admin = require("firebase-admin");
const https = require("https");

const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;
const FIREBASE_API_KEY = "AIzaSyA_Ktefu_zPB0McFFjUqKnDHuzm6HjqwtA";
const TEST_UID = "test-api-user-001";

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;

// ---------------------------------------------------------------------------
// Minimal HTTP client (no axios dependency in test script)
// ---------------------------------------------------------------------------
function request(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const { URL } = require("url");
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : require("http");

    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        ...headers,
      },
    };

    const req = lib.request(options, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Step 1: Initialise Firebase Admin
// ---------------------------------------------------------------------------
function initAdmin() {
  if (admin.apps.length > 0) return;
  admin.initializeApp({
    credential: admin.credential.cert({
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      type: "service_account",
    }),
  });
}

// ---------------------------------------------------------------------------
// Step 2: Mint custom token → exchange for ID token
// ---------------------------------------------------------------------------
async function getIdToken() {
  initAdmin();
  const customToken = await admin.auth().createCustomToken(TEST_UID);

  // Exchange custom token for ID token via Firebase REST API
  const res = await request(
    "POST",
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    { token: customToken, returnSecureToken: true }
  );

  if (!res.body.idToken) {
    throw new Error(`Failed to exchange token: ${JSON.stringify(res.body)}`);
  }
  return res.body.idToken;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ${green("✓")} ${label}`);
    passed++;
  } else {
    console.log(`  ${red("✗")} ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------
async function run() {
  console.log(bold(cyan("\n═══════════════════════════════════════════")));
  console.log(bold(cyan("  Budget Buddy — End-to-End API Test")));
  console.log(bold(cyan("═══════════════════════════════════════════\n")));

  // ── Test 1: Health check ────────────────────────────────────────────────
  console.log(bold("[ 1 ] Health check"));
  const health = await request("GET", `${BASE_URL}/health`);
  check("Server responds 200", health.status === 200, `got ${health.status}`);
  check("MongoDB connected", health.body.mongoState === "connected", health.body.mongoState);
  console.log();

  // ── Test 2: Auth middleware ─────────────────────────────────────────────
  console.log(bold("[ 2 ] Auth middleware"));

  const noHeader = await request("GET", `${BASE_URL}/api/transactions`);
  check("No token → 401", noHeader.status === 401, `got ${noHeader.status}`);

  const badToken = await request("GET", `${BASE_URL}/api/transactions`, null, {
    Authorization: "Bearer notavalidtoken",
  });
  check("Bad token → 401", badToken.status === 401, `got ${badToken.status}`);
  console.log();

  // ── Test 3: Get real Firebase ID token ──────────────────────────────────
  console.log(bold("[ 3 ] Firebase token generation"));
  let idToken;
  try {
    idToken = await getIdToken();
    check("Custom token minted + exchanged for ID token", true);
    console.log(`  ${yellow("→ Token (first 60 chars):")} ${idToken.slice(0, 60)}...`);
  } catch (err) {
    check("Custom token minted + exchanged for ID token", false, err.message);
    console.log(red("\n  Cannot continue without a valid token. Aborting.\n"));
    process.exit(1);
  }
  console.log();

  const auth = { Authorization: `Bearer ${idToken}` };

  // ── Test 4: GET transactions (empty) ────────────────────────────────────
  console.log(bold("[ 4 ] GET /api/transactions (paginated)"));
  const getEmpty = await request("GET", `${BASE_URL}/api/transactions`, null, auth);
  check("Status 200", getEmpty.status === 200, `got ${getEmpty.status}`);
  check("Returns data array",       Array.isArray(getEmpty.body?.data), typeof getEmpty.body?.data);
  check("Returns totalRecords",     typeof getEmpty.body?.totalRecords === "number");
  check("Returns totalPages",       typeof getEmpty.body?.totalPages  === "number");
  check("Returns currentPage",      getEmpty.body?.currentPage === 1);
  console.log();

  // ── Test 5: POST — create a transaction ─────────────────────────────────
  console.log(bold("[ 5 ] POST /api/transactions"));
  const newTx = {
    type: "expense",
    amount: 42.50,
    category: "Food",
    description: "Test lunch — automated",
    date: new Date().toISOString().split("T")[0],
  };
  const postRes = await request("POST", `${BASE_URL}/api/transactions`, newTx, auth);
  check("Status 201", postRes.status === 201, `got ${postRes.status}`);
  check("Returns _id", !!postRes.body?._id, JSON.stringify(postRes.body));
  check("Amount matches", postRes.body?.amount === 42.50, `got ${postRes.body?.amount}`);
  check("UID is set", !!postRes.body?.uid);
  const createdId = postRes.body?._id;
  if (createdId) console.log(`  ${yellow("→ Created _id:")} ${createdId}`);
  console.log();

  // ── Test 6: GET — record appears in list ────────────────────────────────
  console.log(bold("[ 6 ] GET /api/transactions (record exists)"));
  const getList = await request("GET", `${BASE_URL}/api/transactions`, null, auth);
  check("Status 200", getList.status === 200);
  check("totalRecords >= 1", getList.body?.totalRecords >= 1);
  check("Created record is present", getList.body?.data?.some((t) => t._id === createdId));
  console.log();

  // ── Test 6b: Filtering ────────────────────────────────────────
  console.log(bold("[ 6b ] Filtering & search"));

  const searchRes = await request("GET", `${BASE_URL}/api/transactions?search=automated`, null, auth);
  check("search=automated finds the record", searchRes.body?.data?.some((t) => t._id === createdId));

  const catRes = await request("GET", `${BASE_URL}/api/transactions?category=Food`, null, auth);
  check("category=Food finds the record", catRes.body?.data?.some((t) => t._id === createdId));

  const typeRes = await request("GET", `${BASE_URL}/api/transactions?type=expense`, null, auth);
  check("type=expense finds the record", typeRes.body?.data?.some((t) => t._id === createdId));

  const today = new Date().toISOString().split("T")[0];
  const dateRes = await request("GET", `${BASE_URL}/api/transactions?startDate=${today}&endDate=${today}`, null, auth);
  check("startDate/endDate filter finds the record", dateRes.body?.data?.some((t) => t._id === createdId));

  const noMatchRes = await request("GET", `${BASE_URL}/api/transactions?search=zzznomatch`, null, auth);
  check("Non-matching search returns empty data", noMatchRes.body?.data?.length === 0);

  const pageRes = await request("GET", `${BASE_URL}/api/transactions?page=1&limit=1`, null, auth);
  check("limit=1 returns at most 1 record", pageRes.body?.data?.length <= 1);
  check("totalPages calculated correctly",  pageRes.body?.totalPages === Math.ceil(pageRes.body?.totalRecords / 1));
  console.log();

  // ── Test 7: PUT — update the transaction ────────────────────────────────
  console.log(bold("[ 7 ] PUT /api/transactions/:id"));
  const putRes = await request(
    "PUT",
    `${BASE_URL}/api/transactions/${createdId}`,
    { ...newTx, amount: 99.99, description: "Updated by test" },
    auth
  );
  check("Status 200", putRes.status === 200, `got ${putRes.status}`);
  check("Amount updated to 99.99", putRes.body?.amount === 99.99, `got ${putRes.body?.amount}`);
  console.log();

  // ── Test 8: DELETE — remove the transaction ─────────────────────────────
  console.log(bold("[ 8 ] DELETE /api/transactions/:id"));
  const delRes = await request(
    "DELETE",
    `${BASE_URL}/api/transactions/${createdId}`,
    null,
    auth
  );
  check("Status 200", delRes.status === 200, `got ${delRes.status}`);
  check("Returns deletedId", delRes.body?.deletedId === createdId, `got ${delRes.body?.deletedId}`);

  // Confirm it's gone
  const getAfterDel = await request("GET", `${BASE_URL}/api/transactions`, null, auth);
  check("Record no longer in list", !getAfterDel.body.some((t) => t._id === createdId));
  console.log();

  // ── Test 9: Cross-user isolation ────────────────────────────────────────
  console.log(bold("[ 9 ] Cross-user data isolation"));
  // Try to access a random ID as this user — should 404 not 500
  const wrongId = "000000000000000000000000";
  const wrongRes = await request("DELETE", `${BASE_URL}/api/transactions/${wrongId}`, null, auth);
  check("Foreign record → 404", wrongRes.status === 404, `got ${wrongRes.status}`);
  console.log();

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(bold(cyan("═══════════════════════════════════════════")));
  const total = passed + failed;
  if (failed === 0) {
    console.log(bold(green(`  ALL ${total} TESTS PASSED ✓`)));
  } else {
    console.log(bold(green(`  ${passed} passed`)) + "  " + bold(red(`${failed} failed`)));
  }
  console.log(bold(cyan("═══════════════════════════════════════════\n")));

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(red("\nUnexpected error:"), err);
  process.exit(1);
});
