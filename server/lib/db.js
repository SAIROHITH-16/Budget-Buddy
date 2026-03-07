"use strict";

// ── Local SQLite database (better-sqlite3) ─────────────────────────────────
// Stores data in server/data/budget.db — no network, never pauses, free forever.

const Database       = require("better-sqlite3");
const path           = require("path");
const fs             = require("fs");
const { randomUUID } = require("crypto");

// ── Storage setup ──────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "budget.db");

let _db = null;
function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initSchema(_db);
  console.log("[db] SQLite ready →", DB_PATH);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id                TEXT PRIMARY KEY,
      uid               TEXT NOT NULL,
      type              TEXT NOT NULL DEFAULT 'expense',
      amount            REAL NOT NULL DEFAULT 0,
      category          TEXT,
      description       TEXT,
      date              TEXT NOT NULL,
      needs_review      INTEGER NOT NULL DEFAULT 0,
      bank_reference_id TEXT,
      ai_categorized    INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS transactions_uid_idx
      ON transactions (uid);
    CREATE INDEX IF NOT EXISTS transactions_uid_date_idx
      ON transactions (uid, date DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS transactions_uid_bankref_idx
      ON transactions (uid, bank_reference_id)
      WHERE bank_reference_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS budgets (
      id              TEXT PRIMARY KEY,
      uid             TEXT NOT NULL UNIQUE,
      monthly_limit   REAL NOT NULL DEFAULT 0,
      alert_threshold REAL NOT NULL DEFAULT 80,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,
      firebase_uid    TEXT NOT NULL UNIQUE,
      name            TEXT NOT NULL,
      email           TEXT NOT NULL,
      phone           TEXT,
      is_verified     INTEGER NOT NULL DEFAULT 0,
      verify_otp      TEXT,
      otp_expires     TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS users_firebase_uid_idx
      ON users (firebase_uid);

    -- Migration: add OTP columns to existing databases that lack them
    CREATE TEMPORARY TABLE IF NOT EXISTS _col_check (dummy TEXT);
    DROP TABLE _col_check;
  `);

  // Safe column migrations for databases created before OTP support
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN is_verified  INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN verify_otp   TEXT",
    "ALTER TABLE users ADD COLUMN otp_expires  TEXT",
  ]) {
    try { db.exec(stmt); } catch (_) { /* column already exists */ }
  }
}

// ── Column name mappings ───────────────────────────────────────────────────
const APP_TO_DB = {
  _id:             "id",
  needsReview:     "needs_review",
  bankReferenceId: "bank_reference_id",
  aiCategorized:   "ai_categorized",
  monthlyLimit:    "monthly_limit",
  alertThreshold:  "alert_threshold",
  createdAt:       "created_at",
};
const DB_TO_APP = Object.fromEntries(
  Object.entries(APP_TO_DB).map(([a, d]) => [d, a])
);

function dbCol(k) { return APP_TO_DB[k] || k; }

function fromRow(row) {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const ak = DB_TO_APP[k] || k;
    out[ak] = (k === "needs_review" || k === "ai_categorized") ? v === 1 : v;
  }
  return out;
}

function toRow(obj) {
  const row = {};
  for (const [k, v] of Object.entries(obj)) {
    row[dbCol(k)] = typeof v === "boolean" ? (v ? 1 : 0) : v;
  }
  return row;
}

function buildWhere(filter) {
  const keys = Object.keys(filter);
  if (keys.length === 0) return { clause: "", params: [] };
  const parts  = keys.map(k => `${dbCol(k)} = ?`);
  const params = keys.map(k => {
    const v = filter[k];
    return typeof v === "boolean" ? (v ? 1 : 0) : v;
  });
  return { clause: "WHERE " + parts.join(" AND "), params };
}

// ── Public API (all async to match existing route code) ────────────────────

async function find(coll, filter = {}, opts = {}) {
  const db = getDb();
  const { clause, params } = buildWhere(filter);

  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${coll} ${clause}`)
                  .get(...params).n;

  let orderBy = "ORDER BY date DESC, id DESC";
  if (opts.sort) {
    const parts = Object.entries(opts.sort).map(
      ([k, dir]) => `${dbCol(k)} ${dir === -1 || dir === "desc" ? "DESC" : "ASC"}`
    );
    if (parts.length) orderBy = "ORDER BY " + parts.join(", ");
  }

  let limitClause = "";
  if (opts.limit) limitClause += ` LIMIT ${Number(opts.limit)}`;
  if (opts.skip)  limitClause += ` OFFSET ${Number(opts.skip)}`;

  const rows = db.prepare(
    `SELECT * FROM ${coll} ${clause} ${orderBy}${limitClause}`
  ).all(...params);

  return { docs: rows.map(fromRow), total };
}

async function count(coll, filter = {}) {
  const db = getDb();
  const { clause, params } = buildWhere(filter);
  return db.prepare(`SELECT COUNT(*) AS n FROM ${coll} ${clause}`)
           .get(...params).n;
}

async function findOne(coll, filter = {}) {
  const db = getDb();
  const { clause, params } = buildWhere(filter);
  return fromRow(
    db.prepare(`SELECT * FROM ${coll} ${clause} LIMIT 1`).get(...params)
  );
}

async function insertOne(coll, doc) {
  const db  = getDb();
  const row = toRow({ ...doc, _id: doc._id || randomUUID() });
  const keys = Object.keys(row);
  const phs  = keys.map(() => "?").join(", ");
  db.prepare(`INSERT INTO ${coll} (${keys.join(", ")}) VALUES (${phs})`)
    .run(...keys.map(k => row[k]));
  return fromRow(db.prepare(`SELECT * FROM ${coll} WHERE id = ?`).get(row.id));
}

async function insertMany(coll, docs) {
  const db = getDb();
  const results = db.transaction((items) => {
    const out = [];
    for (const doc of items) {
      const row  = toRow({ ...doc, _id: doc._id || randomUUID() });
      const keys = Object.keys(row);
      const phs  = keys.map(() => "?").join(", ");
      db.prepare(
        `INSERT OR IGNORE INTO ${coll} (${keys.join(", ")}) VALUES (${phs})`
      ).run(...keys.map(k => row[k]));
      out.push(fromRow(db.prepare(`SELECT * FROM ${coll} WHERE id = ?`).get(row.id)));
    }
    return out;
  })(docs);
  return results;
}

async function updateOne(coll, filter, update) {
  const db = getDb();
  const { clause, params } = buildWhere(filter);
  const setRow   = toRow(update.$set || update);
  const setParts = Object.keys(setRow).map(k => `${k} = ?`);
  const info = db.prepare(
    `UPDATE ${coll} SET ${setParts.join(", ")} ${clause}`
  ).run(...Object.values(setRow), ...params);
  return { modifiedCount: info.changes };
}

async function findOneAndUpdate(coll, filter, update) {
  const db = getDb();
  const { clause, params } = buildWhere(filter);
  const existing = db.prepare(`SELECT id FROM ${coll} ${clause} LIMIT 1`).get(...params);
  if (!existing) return null;
  const setRow   = toRow(update.$set || update);
  const setParts = Object.keys(setRow).map(k => `${k} = ?`);
  db.prepare(`UPDATE ${coll} SET ${setParts.join(", ")} WHERE id = ?`)
    .run(...Object.values(setRow), existing.id);
  return fromRow(db.prepare(`SELECT * FROM ${coll} WHERE id = ?`).get(existing.id));
}

async function findOneAndDelete(coll, filter) {
  const db = getDb();
  const { clause, params } = buildWhere(filter);
  const row = db.prepare(`SELECT * FROM ${coll} ${clause} LIMIT 1`).get(...params);
  if (!row) return null;
  db.prepare(`DELETE FROM ${coll} WHERE id = ?`).run(row.id);
  return fromRow(row);
}

async function upsertByUid(coll, uid, data) {
  const db  = getDb();
  const row = toRow(data);
  const existing = db.prepare(`SELECT id FROM ${coll} WHERE uid = ?`).get(uid);
  if (existing) {
    const setParts = Object.keys(row).map(k => `${k} = ?`);
    db.prepare(
      `UPDATE ${coll} SET ${setParts.join(", ")}, updated_at = datetime('now') WHERE uid = ?`
    ).run(...Object.values(row), uid);
  } else {
    const newRow = { id: randomUUID(), uid, updated_at: new Date().toISOString(), ...row };
    const keys   = Object.keys(newRow);
    const phs    = keys.map(() => "?").join(", ");
    db.prepare(`INSERT INTO ${coll} (${keys.join(", ")}) VALUES (${phs})`)
      .run(...keys.map(k => newRow[k]));
  }
  return fromRow(db.prepare(`SELECT * FROM ${coll} WHERE uid = ?`).get(uid));
}

// Accepts both (uid, refIds) and legacy (coll, uid, refIds)
async function existingRefIds(collOrUid, uidOrRefIds, maybeRefIds) {
  const uid    = maybeRefIds !== undefined ? uidOrRefIds : collOrUid;
  const refIds = maybeRefIds !== undefined ? maybeRefIds  : uidOrRefIds;
  if (!refIds || refIds.length === 0) return new Set();
  const db  = getDb();
  const phs = refIds.map(() => "?").join(", ");
  const rows = db.prepare(
    `SELECT bank_reference_id FROM transactions WHERE uid = ? AND bank_reference_id IN (${phs})`
  ).all(uid, ...refIds);
  return new Set(rows.map(r => r.bank_reference_id));
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

