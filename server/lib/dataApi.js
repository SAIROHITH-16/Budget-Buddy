"use strict";

// server/lib/dataApi.js
// MongoDB Atlas Data API HTTP client.
// Works over HTTPS port 443 — used when direct TCP port 27017 is blocked by ISP/firewall/corporate network.
//
// How to enable (one-time Atlas dashboard setup):
//   1. cloud.mongodb.com → App Services → click your atlas app (or create one)
//   2. Left sidebar → HTTPS Endpoints → Data API → Enable
//   3. Click "Generate API Key" → copy the key
//   4. Find your App ID in the URL or top of the page (starts with "data-")
//   5. Add to server/.env:
//        ATLAS_APP_ID=data-xxxxxxxx
//        ATLAS_DATA_API_KEY=your-key-here
//   6. Restart the server

const APP_ID  = process.env.ATLAS_APP_ID;
const API_KEY = process.env.ATLAS_DATA_API_KEY;
const DB_NAME = process.env.ATLAS_DB_NAME || "budget-buddy";
const DS_NAME = process.env.ATLAS_DATA_SOURCE || "Cluster0";

function isConfigured() {
  return !!(APP_ID && API_KEY);
}

// ---------------------------------------------------------------------------
// Core HTTP helper
// ---------------------------------------------------------------------------
async function req(action, body) {
  if (!isConfigured()) {
    const err = new Error(
      "Atlas Data API not configured. " +
      "Add ATLAS_APP_ID and ATLAS_DATA_API_KEY to server/.env. " +
      "Enable at: cloud.mongodb.com → App Services → Data API"
    );
    err.code = "DATA_API_NOT_CONFIGURED";
    throw err;
  }
  const url = `https://data.mongodb-api.com/app/${APP_ID}/endpoint/data/v1/action/${action}`;
  const response = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key":       API_KEY,
    },
    body: JSON.stringify({
      dataSource: DS_NAME,
      database:   DB_NAME,
      ...body,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Atlas Data API [${action}] HTTP ${response.status}: ${text}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Extended-JSON helpers
// ---------------------------------------------------------------------------

// Wrap an ObjectId string into the format the Data API expects in filter/update
const oid = (id) => ({ "$oid": String(id) });

// Normalise a document returned by the Data API:
//   – _id: { "$oid": "..." }  →  _id: "..."
//   – date: { "$date": "..." } →  date: "YYYY-MM-DD"
function norm(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const out = { ...doc };
  // Normalise _id
  if (out._id && typeof out._id === "object" && out._id.$oid) {
    out._id = out._id.$oid;
  } else if (out._id && typeof out._id !== "string") {
    out._id = String(out._id);
  }
  // Normalise date field
  if (out.date && typeof out.date === "object") {
    const raw = out.date.$date;
    if (raw != null) {
      out.date = typeof raw === "string"
        ? raw.substring(0, 10)
        : new Date(raw).toISOString().substring(0, 10);
    }
  }
  return out;
}

// Prepare a document for insert: convert JS Date → ISO string, keep _id if present
function prepDoc(doc) {
  const out = { ...doc };
  if (out.date instanceof Date) {
    // Store as ISO Date — Data API accepts ISO strings for Date fields
    out.date = out.date.toISOString();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find multiple documents.
 * @param {string} coll - collection name
 * @param {object} filter - MongoDB filter
 * @param {{ sort?, skip?, limit?, projection? }} opts
 * @returns {Promise<object[]>}
 */
async function find(coll, filter, opts = {}) {
  const body = { collection: coll, filter };
  if (opts.sort)       body.sort       = opts.sort;
  if (opts.skip  > 0)  body.skip       = opts.skip;
  if (opts.limit)      body.limit      = opts.limit;
  if (opts.projection) body.projection = opts.projection;
  const r = await req("find", body);
  return (r.documents ?? []).map(norm);
}

/**
 * Count documents matching a filter.
 * @returns {Promise<number>}
 */
async function count(coll, filter) {
  const r = await req("aggregate", {
    collection: coll,
    pipeline: [{ $match: filter }, { $count: "n" }],
  });
  return r.documents?.[0]?.n ?? 0;
}

/**
 * Find a single document.
 * @returns {Promise<object|null>}
 */
async function findOne(coll, filter) {
  const r = await req("findOne", { collection: coll, filter });
  return r.document ? norm(r.document) : null;
}

/**
 * Insert a single document.
 * @returns {Promise<object>} The inserted document with _id string.
 */
async function insertOne(coll, document) {
  const doc = prepDoc(document);
  const r = await req("insertOne", { collection: coll, document: doc });
  const rawId = r.insertedId;
  const id = rawId && typeof rawId === "object" && rawId.$oid ? rawId.$oid : String(rawId);
  return { _id: id, ...doc };
}

/**
 * Insert multiple documents.
 * @returns {Promise<{ insertedCount: number, insertedIds: string[] }>}
 */
async function insertMany(coll, documents) {
  const docs = documents.map(prepDoc);
  const r = await req("insertMany", { collection: coll, documents: docs });
  const ids = (r.insertedIds ?? []).map((raw) =>
    raw && typeof raw === "object" && raw.$oid ? raw.$oid : String(raw)
  );
  return { insertedCount: ids.length, insertedIds: ids };
}

/**
 * Update a single document. Does NOT return the updated doc.
 * @returns {Promise<{ matchedCount, modifiedCount, upsertedId? }>}
 */
async function updateOne(coll, filter, update, upsert = false) {
  const r = await req("updateOne", { collection: coll, filter, update, upsert });
  return {
    matchedCount:  r.matchedCount  ?? 0,
    modifiedCount: r.modifiedCount ?? 0,
    upsertedId:    r.upsertedId   ?? null,
  };
}

/**
 * Find + update in sequence — simulates Mongoose findOneAndUpdate({ new: true }).
 * @returns {Promise<object|null>} The updated document, or null if not found.
 */
async function findOneAndUpdate(coll, filter, update) {
  const result = await updateOne(coll, filter, update, false);
  if (result.matchedCount === 0) return null;
  return findOne(coll, filter);
}

/**
 * Find + delete in sequence — simulates Mongoose findOneAndDelete().
 * @returns {Promise<object|null>} The document that was deleted, or null if not found.
 */
async function findOneAndDelete(coll, filter) {
  const doc = await findOne(coll, filter);
  if (!doc) return null;
  await req("deleteOne", { collection: coll, filter });
  return doc;
}

/**
 * Upsert a single document with $setOnInsert (dedup import).
 * @returns {{ upserted: boolean, matched: boolean }}
 */
async function upsertOne(coll, filter, setOnInsert) {
  const result = await updateOne(coll, filter, { $setOnInsert: setOnInsert }, true);
  return {
    upserted: result.upsertedId != null,
    matched:  result.matchedCount > 0 && result.upsertedId == null,
  };
}

module.exports = {
  isConfigured,
  oid,
  find,
  count,
  findOne,
  insertOne,
  insertMany,
  updateOne,
  findOneAndUpdate,
  findOneAndDelete,
  upsertOne,
};
