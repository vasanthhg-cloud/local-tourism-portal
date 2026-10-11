/* Namma Trails — booking API.
 *
 * Endpoints
 *   GET  /api/health            → { ok, time }
 *   GET  /api/listings          → { listings: [...] }
 *   GET  /api/listings/:id      → { listing }
 *   POST /api/bookings          → { ok, booking }
 *   GET  /api/bookings          → { bookings: [...] }   (protect this in production)
 *
 * It also serves the static front-end from the repo root, so running
 *   node server/server.js
 * gives you the whole site at http://localhost:3000
 *
 * Bookings are appended to server/bookings.json — swap this for a real
 * database (Postgres, SQLite, Mongo…) when you go to production.
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = path.resolve(__dirname, "..");
const LISTINGS_FILE = path.join(__dirname, "listings.json");
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

app.use(cors());
app.use(express.json({ limit: "100kb" }));

/* ---------- helpers ---------- */

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadListings() {
  return readJSON(LISTINGS_FILE, []);
}

function makeRef() {
  const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += s[Math.floor(Math.random() * s.length)];
  return "NT-" + out;
}

function isValidEmail(v) {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/* ---------- API ---------- */

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/api/listings", (_req, res) => {
  res.json({ listings: loadListings() });
});

app.get("/api/listings/:id", (req, res) => {
  const listing = loadListings().find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: "Listing not found" });
  res.json({ listing });
});

app.post("/api/bookings", (req, res) => {
  const b = req.body || {};
  const errors = [];

  if (!b.listingId) errors.push("listingId is required");
  if (!b.name || !String(b.name).trim()) errors.push("name is required");
  if (!isValidEmail(b.email)) errors.push("a valid email is required");

  const listing = loadListings().find((l) => l.id === b.listingId);
  if (b.listingId && !listing) errors.push("unknown listingId");

  if (errors.length) return res.status(400).json({ error: "Validation failed", details: errors });

  const booking = {
    id: b.id && /^NT-[A-Z0-9]{6}$/.test(b.id) ? b.id : makeRef(),
    listingId: b.listingId,
    listingName: listing ? listing.name : b.listingName || "",
    type: b.type || (listing ? listing.type : "booking"),
    host: listing ? listing.host : b.host || "",
    name: String(b.name).trim(),
    email: String(b.email).trim(),
    phone: b.phone ? String(b.phone).trim() : "",
    date: b.date || "",
    checkOut: b.checkOut || "",
    guests: Number.isFinite(+b.guests) ? +b.guests : null,
    total: Number.isFinite(+b.total) ? +b.total : null,
    notes: b.notes ? String(b.notes).trim().slice(0, 1000) : "",
    createdAt: new Date().toISOString(),
  };

  const all = readJSON(BOOKINGS_FILE, []);
  all.push(booking);
  writeJSON(BOOKINGS_FILE, all);

  res.status(201).json({ ok: true, booking });
});

app.get("/api/bookings", (_req, res) => {
  // NOTE: no auth here for demo simplicity. Add authentication before exposing this.
  res.json({ bookings: readJSON(BOOKINGS_FILE, []) });
});

/* ---------- static front-end ---------- */

app.use(express.static(ROOT));

app.get("*", (_req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Namma Trails running at http://localhost:${PORT}`);
    console.log(`Listings file: ${LISTINGS_FILE}`);
    console.log(`Bookings file: ${BOOKINGS_FILE}`);
  });
}

module.exports = app;
