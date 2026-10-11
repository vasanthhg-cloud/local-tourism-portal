# Namma Trails — Smart Local Tourism Business Portal

A web platform that promotes **local tourism** — homestays, licensed guides,
cultural experiences and community businesses — with **booking facilities**.
This demo is built around **Karnataka** (Coorg, Hampi, Mysuru, Chikmagalur,
Gokarna, Udupi).

Travel that keeps money in local hands: hosts keep what they earn, travellers
book directly, and there's no middleman commission.

> All listings, hosts, prices and reviews in this repo are **fictional sample
> content** for demonstration. Replace them with real data before launch.

---

## What's inside

| Area | What it does |
|------|--------------|
| **Discover** | Filterable grid of homestays, guides, experiences and local shops |
| **Nearby** | "Use my location" sorts results by real distance (haversine) and shows how far each place is |
| **Map** | Interactive Leaflet/OpenStreetMap view — pins follow your current interest filter, tap a pin to book |
| **Search** | Filter by destination, interest/category and keyword |
| **Listing detail** | Photo, highlights, host, capacity and pricing |
| **Booking flow** | Dates, group size, live total, confirmation with a reference code |
| **Enquiries** | Local shops take enquiry messages instead of bookings |
| **Backend** | Node/Express API that stores bookings in a JSON file |

The front-end works **standalone** (GitHub Pages) using `data.js` and saving
bookings in the browser, and **upgrades automatically** to the API when the
Node server is running.

### Nearby places + map

Every listing carries `lat`/`lng`. When a visitor taps **Use my location**, the
app asks the browser for their coordinates, computes the distance to each
listing, re-sorts results **nearest first**, and drops a blue "you are here" pin
on the map. The map's pins always mirror the active **interest filter** and
search, so switching from *Everything* to *Homestays* redraws the map to just
those places.

The map uses **Leaflet + OpenStreetMap tiles** — free and key-less. Tapping a
pin opens that listing's booking/enquiry panel directly.

Leaflet itself is **bundled in `assets/leaflet/`** (not loaded from a CDN), so
the map works even on networks that block CDNs, with a CDN fallback if the
local copy is ever unreachable. Tiles are fetched from a **chain of free
providers** (OpenStreetMap → CARTO → OSM Germany); if one is blocked, the app
automatically tries the next, and if all fail it says so in the note under the
map instead of showing a silent grey box.

> The repo includes a **`.nojekyll`** file at its root. This is important:
> GitHub Pages builds sites with Jekyll by default, and Jekyll silently drops
> certain folders (including `vendor/`) from the published site. `.nojekyll`
> tells Pages to serve the files exactly as they are in the repo. Keep it.

> Geolocation only works over **HTTPS** (or `localhost`). GitHub Pages serves
> HTTPS, so it works on the live site; opening `index.html` via `file://` will
> not prompt for location.

---

## Project structure

```
local-tourism-portal/
├── index.html          # Page markup
├── styles.css          # Warm, earthy travel theme (terracotta + forest green)
├── app.js              # Filters, nearby/distance, map, booking flow
├── data.js             # Sample listings (with lat/lng), regions, testimonials
├── assets/leaflet/     # Leaflet bundled locally (no CDN dependency)
├── .nojekyll           # Tell GitHub Pages to skip Jekyll (keeps assets/ served)
├── README.md
└── server/             # Optional Node/Express backend
    ├── server.js       # API + serves the static site
    ├── package.json
    ├── listings.json   # Generated from data.js
    └── .gitignore
```

---

## Run the front-end only (no install)

Open `index.html` in a browser, or serve it:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Bookings are saved to your browser's `localStorage` in this mode.

---

## Run the full stack (with the booking API)

```bash
cd server
npm install
npm start
# open http://localhost:3000
```

The server serves both the site and the API. Bookings are appended to
`server/bookings.json`.

### API reference

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/health` | Health check |
| `GET`  | `/api/listings` | All listings |
| `GET`  | `/api/listings/:id` | One listing |
| `POST` | `/api/bookings` | Create a booking (validates name, email, listing) |
| `GET`  | `/api/bookings` | All bookings (**add auth before exposing**) |

Example:

```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"listingId":"hs-001","name":"Asha","email":"asha@example.com","date":"2026-11-02","guests":2,"total":6400}'
```

---

## Deploy

**Front-end on GitHub Pages**

1. Push this repo to GitHub.
2. **Settings → Pages → Source: Deploy from a branch → `main` / root.**
3. Live at `https://<username>.github.io/local-tourism-portal/`.

The static build detects that no API is present and falls back to bundled data
+ local bookings, so the Pages site is fully functional as a demo.

**Backend** (optional) — deploy `server/` to any Node host (Render, Railway,
Fly.io, a VPS). Point the front-end at it by setting `const API` in `app.js`
to your API's URL instead of `""`.

---

## Going to production — checklist

- Replace sample listings in `data.js` (and regenerate `server/listings.json`).
- Swap `bookings.json` for a real database.
- Add authentication to `GET /api/bookings`.
- Add real payments (Razorpay/UPI) and email/WhatsApp notifications to hosts.
- Replace placeholder photos (`picsum.photos`) with real, licensed images.
- Add privacy policy and terms, especially for personal data collected at booking.

---

## Credits

Design and code: demonstration project. Fonts: [Fraunces](https://fonts.google.com/specimen/Fraunces)
and [Inter](https://fonts.google.com/specimen/Inter). Placeholder images:
[picsum.photos](https://picsum.photos).
