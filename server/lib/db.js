"use strict";

// ── Supabase / PostgreSQL database layer ──────────────────────────────────
// Replaces the previous better-sqlite3 / SQLite implementation.
// Uses @supabase/supabase-js with the SERVICE ROLE key so every query
// bypasses Row-Level Security — auth is enforced by the Firebase verifyToken
// middleware on every Express route.
//
// Required env vars (add in Render dashboard → Environment):
//   SUPABASE_URL              = https://mggvdhdjkszehutfhmbl.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = <service_role secret from Supabase → Settings → API>

const { createClient } = require("@supabase/supabase-js");
const { randomUUID }   = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "[db] FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
    "     Get them from: Supabase → project → Settings → API"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});
console.log("[db] Supabase client ready →", SUPABASE_URL);

// getDb() returns the raw Supabase client for routes that need direct queries.
function getDb() { return supabase; }



// ── Column name mappings ───────────────────────────────────────────────────
const APP_TO_DB = {
  _id:              "id",
  needsReview:      "needs_review",
  bankReferenceId:  "bank_reference_id",
  aiCategorized:    "ai_categorized",
  monthlyLimit:     "monthly_limit",
  alertThreshold:   "alert_threshold",
  createdAt:        "created_at",
  firebaseUid:      "firebase_uid",
  isVerified:       "is_verified",
  verifyOtp:        "verify_otp",
  otpExpires:       "otp_expires",
  isPhoneVerified:  "is_phone_verified",
  updatedAt:        "updated_at",
  expiresAt:        "expires_at",
  // Loan fields
  borrowerName:     "borrower_name",
  dueDate:          "due_date",
  repaidAmount:     "repaid_amount",
  remainingAmount:  "remaining_amount",
  loanStatus:       "loan_status",
};
const DB_TO_APP = Object.fromEntries(
  Object.entries(APP_TO_DB).map(([a, d]) => [d, a])
);

function dbCol(k) { return APP_TO_DB[k] || k; }

function fromRow(row) {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[DB_TO_APP[k] || k] = v;
  }
  return out;
}

function toRow(obj) {
  const row = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) row[dbCol(k)] = v;
  }
  return row;
}

// Apply a filter object as .eq() chains on a Supabase query builder
function applyFilter(query, filter) {
  for (const [k, v] of Object.entries(filter)) {
    query = query.eq(dbCol(k), v);
  }
  return query;
}

// Apply sort — default: date DESC, id DESC
function applySort(query, sort) {
  if (!sort || Object.keys(sort).length === 0) {
    return query.order("date", { ascending: false }).order("id", { ascending: false });
  }
  for (const [k, dir] of Object.entries(sort)) {
    query = query.order(dbCol(k), { ascending: dir !== -1 && dir !== "desc" });
  }
  return query;
}

function assertOk({ error }, context) {
  if (error) {
    console.error(`[db] Supabase error (${context}):`, error);
    throw new Error(`${context}: ${error.message}`);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

async function find(coll, filter = {}, opts = {}) {
  // Count
  let cntQ = supabase.from(coll).select("*", { count: "exact", head: true });
  cntQ = applyFilter(cntQ, filter);
  const { count: total, error: cntErr } = await cntQ;
  if (cntErr) throw new Error(`find/count ${coll}: ${cntErr.message}`);

  // Data
  let dataQ = supabase.from(coll).select("*");
  dataQ = applyFilter(dataQ, filter);
  dataQ = applySort(dataQ, opts.sort);
  if (opts.limit) {
    const lim  = Number(opts.limit);
    const skip = Number(opts.skip) || 0;
    dataQ = dataQ.range(skip, skip + lim - 1);
  }
  const { data, error } = await dataQ;
  assertOk({ error }, `find ${coll}`);
  return { docs: (data || []).map(fromRow), total: total || 0 };
}

async function count(coll, filter = {}) {
  let q = supabase.from(coll).select("*", { count: "exact", head: true });
  q = applyFilter(q, filter);
  const { count: n, error } = await q;
  assertOk({ error }, `count ${coll}`);
  return n || 0;
}

async function findOne(coll, filter = {}) {
  let q = supabase.from(coll).select("*");
  q = applyFilter(q, filter);
  const { data, error } = await q.limit(1).maybeSingle();
  assertOk({ error }, `findOne ${coll}`);
  return fromRow(data);
}

async function insertOne(coll, doc) {
  const row = toRow({ ...doc, _id: doc._id || doc.id || randomUUID() });
  const { data, error } = await supabase.from(coll).insert(row).select().single();
  assertOk({ error }, `insertOne ${coll}`);
  return fromRow(data);
}

async function insertMany(coll, docs) {
  const rows = docs.map((doc) => toRow({ ...doc, _id: doc._id || doc.id || randomUUID() }));
  const { data, error } = await supabase
    .from(coll)
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
    .select();
  assertOk({ error }, `insertMany ${coll}`);
  return (data || []).map(fromRow);
}

async function updateOne(coll, filter, update) {
  const setRow = toRow(update.$set || update);
  let q = supabase.from(coll).update(setRow);
  q = applyFilter(q, filter);
  const { error } = await q;
  assertOk({ error }, `updateOne ${coll}`);
  return { modifiedCount: 1 };
}

async function findOneAndUpdate(coll, filter, update) {
  const setRow = toRow(update.$set || update);
  const existing = db.prepare(`SELECT id FROM ${coll} ${clause} LIMIT 1`).get(...params);
  if (!existing) return null;
  const setRow   = toRow(update.$set || update);
  let q = supabase.from(coll).update(setRow);
  q = applyFilter(q, filter);
  const { data, error } = await q.select().maybeSingle();
  assertOk({ error }, `findOneAndUpdate ${coll}`);
  return fromRow(data);
}

async function findOneAndDelete(coll, filter) {
  const existing = await findOne(coll, filter);
  if (!existing) return null;
  const id = existing._id || existing.id;
  const { error } = await supabase.from(coll).delete().eq("id", id);
  assertOk({ error }, `findOneAndDelete ${coll}`);
  return existing;
}

async function upsertByUid(coll, uid, data) {
  const row = { id: randomUUID(), uid, updated_at: new Date().toISOString(), ...toRow(data) };
  const { data: result, error } = await supabase
    .from(coll)
    .upsert(row, { onConflict: "uid" })
    .select()
    .single();
  assertOk({ error }, `upsertByUid ${coll}`);
  return fromRow(result);
}

// Accepts both (uid, refIds) and legacy (coll, uid, refIds)
async function existingRefIds(collOrUid, uidOrRefIds, maybeRefIds) {
  const uid    = maybeRefIds !== undefined ? uidOrRefIds : collOrUid;
  const refIds = maybeRefIds !== undefined ? maybeRefIds  : uidOrRefIds;
  if (!refIds || refIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("transactions")
    .select("bank_reference_id")
    .eq("uid", uid)
    .in("bank_reference_id", refIds);
  assertOk({ error }, "existingRefIds");
  return new Set((data || []).map((r) => r.bank_reference_id));
}

module.exports = {
  getDb,
  find,
  count,
  findOne,
  insertOne,
  insertMany,
  updateOne,
  findOneAndUpdate,
  findOneAndDelete,
  upsertByUid,
  existingRefIds,
};

