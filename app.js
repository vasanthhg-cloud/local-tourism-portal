/* Namma Trails — front-end logic.
   • Results + map reflect the user's chosen interest (category) and search.
   • "Use my location" sorts listings by distance and centres the map.
   • Works static (GitHub Pages, data.js + localStorage) and upgrades to the
     Node API when the server is running. */

(function () {
  "use strict";

  const D = window.SITE_DATA;
  const API = ""; // same-origin when served by the Node server; harmless when static

  const state = {
    type: "all", region: "", query: "",
    listings: [], usingApi: false,
    userLoc: null, sort: "recommended",
    map: null, layer: null, userMarker: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const TYPE_LABEL = { homestay: "Homestay", guide: "Local guide", experience: "Experience", shop: "Local business" };
  const TYPE_ICON = { homestay: "🏠", guide: "🧭", experience: "🎭", shop: "🛍️" };
  const UNIT_LABEL = { night: "night", "half-day": "half-day", day: "day", person: "person", item: "item" };

  const money = (n) => "₹" + Number(n).toLocaleString("en-IN");

  /* ---------------- geo helpers ---------------- */

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function distanceTo(l) {
    if (!state.userLoc || l.lat == null) return null;
    return haversine(state.userLoc.lat, state.userLoc.lon, l.lat, l.lng);
  }

  function formatDist(km) {
    if (km == null) return "";
    if (km < 1) return Math.round(km * 1000) + " m away";
    if (km < 10) return km.toFixed(1) + " km away";
    return Math.round(km) + " km away";
  }

  /* ---------------- small UI helpers ---------------- */

  function priceLabel(l) {
    if (l.type === "shop") return "Enquire";
    return money(l.price) + " <small>/ " + (UNIT_LABEL[l.unit] || l.unit) + "</small>";
  }

  function ref() {
    const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 6; i++) out += s[Math.floor(Math.random() * s.length)];
    return "NT-" + out;
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => (t.hidden = true), 3200);
  }

  function safeImg(src) {
    return `<img src="${src}" alt="" loading="lazy" onerror="this.style.display='none'">`;
  }

  function setLocStatus(msg, kind) {
    const el = $("#locStatus");
    el.textContent = msg;
    el.classList.remove("loc-status--ok", "loc-status--err");
    if (kind) el.classList.add("loc-status--" + kind);
  }

  /* ---------------- boot ---------------- */

  async function boot() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(API + "/api/listings", { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.listings) && json.listings.length) {
          state.listings = json.listings;
          state.usingApi = true;
        }
      }
    } catch (_) { /* static mode */ }

    if (!state.listings.length) state.listings = D.listings;

    buildSelects();
    buildFilters();
    buildChips();
    renderQuotes();
    initMap();
    render();
    $("#year").textContent = new Date().getFullYear();
    $("#statListings").textContent = state.listings.length + "+";
    wireEvents();
  }

  /* ---------------- chrome ---------------- */

  function buildSelects() {
    D.regions.forEach((r) => $("#regionSelect").insertAdjacentHTML("beforeend", `<option value="${r}">${r}</option>`));
    D.categories.filter((c) => c.id !== "all").forEach((c) =>
      $("#typeSelect").insertAdjacentHTML("beforeend", `<option value="${c.id}">${c.label}</option>`));
  }

  function buildFilters() {
    const wrap = $("#filters");
    wrap.innerHTML = D.categories
      .map((c) => `<button class="filter${c.id === "all" ? " is-active" : ""}" data-type="${c.id}" role="tab">${c.label}</button>`)
      .join("");
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter");
      if (!btn) return;
      state.type = btn.dataset.type;
      $$(".filter").forEach((f) => f.classList.toggle("is-active", f === btn));
      render();
    });
  }

  function buildChips() {
    const chips = ["Coffee estate", "Trekking", "Heritage", "Silk", "Sunset", "Cooking class"];
    $("#heroChips").innerHTML = chips.map((c) => `<button class="chip" data-chip="${c}">${c}</button>`).join("");
    $("#heroChips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      $("#queryInput").value = b.dataset.chip;
      state.query = b.dataset.chip.toLowerCase();
      render();
      document.getElementById("listings").scrollIntoView({ behavior: "smooth" });
    });
  }

  function renderQuotes() {
    $("#quotesGrid").innerHTML = D.testimonials
      .map((t) => `
        <figure class="quote">
          <span class="quote__mark" aria-hidden="true">&#8220;</span>
          <blockquote class="quote__text">${t.quote}</blockquote>
          <figcaption class="quote__by">${t.name} · ${t.place}</figcaption>
        </figure>`)
      .join("");
  }

  /* ---------------- filtering ---------------- */

  function filtered() {
    const q = state.query.trim().toLowerCase();
    let items = state.listings.filter((l) => {
      if (state.type !== "all" && l.type !== state.type) return false;
      if (state.region && l.region !== state.region) return false;
      if (q) {
        const hay = [l.name, l.location, l.region, l.blurb, l.host, (l.tags || []).join(" ")].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (state.sort === "nearest" && state.userLoc) {
      items = items.slice().sort((a, b) => (distanceTo(a) ?? 1e9) - (distanceTo(b) ?? 1e9));
    }
    return items;
  }

  function render() {
    const items = filtered();
    const grid = $("#listingGrid");
    grid.innerHTML = items.map(cardHTML).join("");
    $("#emptyState").hidden = items.length > 0;

    const sortedNote = state.sort === "nearest" && state.userLoc ? " · nearest first" : "";
    $("#resultsCount").textContent = items.length
      ? `${items.length} ${items.length === 1 ? "place" : "places"}${sortedNote}${state.usingApi ? " · live" : ""}`
      : "Nothing found";

    syncMap(items);
  }

  function cardHTML(l) {
    const d = distanceTo(l);
    return `
      <article class="card" data-id="${l.id}">
        <div class="card__media">
          ${safeImg(l.image)}
          <span class="card__badge">${TYPE_LABEL[l.type]}</span>
          ${l.rating ? `<span class="card__rating"><span class="star">★</span>${l.rating}</span>` : ""}
        </div>
        <div class="card__body">
          <h3 class="card__name">${l.name}</h3>
          <p class="card__loc">📍 ${l.location}, ${l.region}${d != null ? ` &nbsp;<span class="card__dist">${formatDist(d)}</span>` : ""}</p>
          <p class="card__blurb">${l.blurb}</p>
          <div class="card__tags">${(l.tags || []).slice(0, 3).map((t) => `<span class="tag">${t}</span>`).join("")}</div>
          <div class="card__foot">
            <span class="card__price">${priceLabel(l)}</span>
            <button class="btn btn--primary card__btn" data-id="${l.id}">${l.type === "shop" ? "Enquire" : "Book"}</button>
          </div>
        </div>
      </article>`;
  }

  /* ---------------- map ---------------- */

  function initMap() {
    if (typeof L === "undefined") {
      $("#mapNote").textContent = "Map could not load (offline). Listings still work below.";
      return;
    }
    state.map = L.map("map", { scrollWheelZoom: false }).setView([14.6, 76.0], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(state.map);
    state.layer = L.layerGroup().addTo(state.map);
  }

  function pinIcon(type) {
    return L.divIcon({
      className: "",
      html: `<div class="pin pin--${type}"><span>${TYPE_ICON[type] || "📍"}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -28],
    });
  }

  function syncMap(items) {
    if (!state.map) return;
    state.layer.clearLayers();

    items.forEach((l) => {
      if (l.lat == null) return;
      const d = distanceTo(l);
      const marker = L.marker([l.lat, l.lng], { icon: pinIcon(l.type), title: l.name });
      marker.bindPopup(
        `<b>${l.name}</b>
         <div class="pop__meta">${TYPE_LABEL[l.type]} · ${l.location}, ${l.region}${d != null ? " · " + formatDist(d) : ""}</div>
         <button class="pop__btn" data-open="${l.id}">View &amp; ${l.type === "shop" ? "enquire" : "book"}</button>`
      );
      marker.addTo(state.layer);
    });

    if (state.userLoc) {
      const you = L.marker([state.userLoc.lat, state.userLoc.lon], {
        icon: L.divIcon({ className: "", html: `<div class="pin pin--user"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] }),
        title: "You are here",
      });
      you.bindPopup("<b>You are here</b>");
      you.addTo(state.layer);
    }

    // Fit the view to what's shown (results + the user, if we know where they are)
    const pts = items.filter((l) => l.lat != null).map((l) => [l.lat, l.lng]);
    if (state.userLoc) pts.push([state.userLoc.lat, state.userLoc.lon]);
    if (pts.length === 1) {
      state.map.setView(pts[0], 11);
    } else if (pts.length > 1) {
      state.map.fitBounds(pts, { padding: [40, 40], maxZoom: 11 });
    }
    setTimeout(() => state.map && state.map.invalidateSize(), 60);
  }

  /* ---------------- geolocation ---------------- */

  function locate() {
    if (!navigator.geolocation) {
      setLocStatus("Geolocation isn't supported by this browser.", "err");
      toast("This browser can't share location.");
      return;
    }
    setLocStatus("Locating…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.userLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        state.sort = "nearest";
        $$(".sort__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.sort === "nearest"));
        $('.sort__btn[data-sort="nearest"]').disabled = false;
        setLocStatus("Showing places nearest to you first.", "ok");
        toast("Location found — sorting by distance.");
        render();
      },
      (err) => {
        const msg = err && err.code === 1
          ? "Location permission denied — browse all of Karnataka instead."
          : "Couldn't get your location. Try again or search a city.";
        setLocStatus(msg, "err");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  /* ---------------- modal / booking ---------------- */

  function openListing(id) {
    const l = state.listings.find((x) => x.id === id);
    if (!l) return;
    const d = distanceTo(l);
    $("#modalBody").innerHTML = `
      <div class="detail__media">${safeImg(l.image)}</div>
      <div class="detail__inner">
        <div class="detail__head">
          <div>
            <span class="tag">${TYPE_LABEL[l.type]}</span>
            <h2 class="detail__name" style="margin-top:10px">${l.name}</h2>
            <p class="detail__loc">📍 ${l.location}, ${l.region} &nbsp;·&nbsp; Hosted by ${l.host}${d != null ? ` &nbsp;·&nbsp; <span class="card__dist">${formatDist(d)}</span>` : ""}</p>
          </div>
          ${l.rating ? `<div style="text-align:right"><div class="card__rating" style="position:static">★ ${l.rating}</div><div style="font-size:12.5px;color:var(--ink-soft)">${l.reviews} reviews</div></div>` : ""}
        </div>
        <p class="detail__blurb">${l.blurb}</p>
        <ul class="detail__highlights">${(l.highlights || []).map((h) => `<li>${h}</li>`).join("")}</ul>
        <div class="detail__meta">
          <div><strong>${l.type === "shop" ? "—" : money(l.price)}</strong><span>${l.type === "shop" ? "contact to buy" : "per " + (UNIT_LABEL[l.unit] || l.unit)}</span></div>
          ${l.capacity ? `<div><strong>Up to ${l.capacity}</strong><span>guests / group</span></div>` : ""}
          <div><strong>${l.location}</strong><span>${l.region}, Karnataka</span></div>
        </div>
        ${l.type === "shop" ? enquiryFormHTML(l) : bookingFormHTML(l)}
      </div>`;
    openModal();
    if (l.type !== "shop") wireBookingForm(l);
    else wireEnquiryForm(l);
  }

  function bookingFormHTML(l) {
    const today = new Date().toISOString().slice(0, 10);
    const isStay = l.type === "homestay";
    const perPerson = l.unit === "person";
    return `
      <form class="book" id="bookForm">
        <h3>${isStay ? "Book your stay" : "Book this " + TYPE_LABEL[l.type].toLowerCase()}</h3>
        <div class="book__grid">
          <div class="field">
            <label for="bf-date">${isStay ? "Check-in" : "Date"}</label>
            <input type="date" id="bf-date" min="${today}" value="${today}" required />
          </div>
          ${isStay ? `
          <div class="field">
            <label for="bf-out">Check-out</label>
            <input type="date" id="bf-out" min="${today}" required />
          </div>` : ""}
          <div class="field">
            <label for="bf-guests">${perPerson ? "People" : "Group size"}</label>
            <input type="number" id="bf-guests" min="1" max="${l.capacity || 10}" value="2" required />
          </div>
          <div class="field">
            <label for="bf-name">Full name</label>
            <input type="text" id="bf-name" placeholder="Your name" required />
          </div>
          <div class="field">
            <label for="bf-email">Email</label>
            <input type="email" id="bf-email" placeholder="you@example.com" required />
          </div>
          <div class="field">
            <label for="bf-phone">Phone</label>
            <input type="tel" id="bf-phone" placeholder="+91…" required />
          </div>
          <div class="field field--full">
            <label for="bf-notes">Anything we should know? (optional)</label>
            <textarea id="bf-notes" rows="2" placeholder="Dietary needs, arrival time…"></textarea>
          </div>
        </div>
        <div class="book__total">
          <span id="bf-total-label">Estimated total</span>
          <strong id="bf-total">${money(l.price)}</strong>
        </div>
        <button class="btn btn--primary btn--block" type="submit">Confirm booking</button>
        <p class="book__note">No payment is taken here — this is a booking request sent to the host.</p>
      </form>`;
  }

  function enquiryFormHTML(l) {
    return `
      <form class="book" id="bookForm">
        <h3>Enquire with ${l.host}</h3>
        <div class="book__grid">
          <div class="field">
            <label for="bf-name">Full name</label>
            <input type="text" id="bf-name" placeholder="Your name" required />
          </div>
          <div class="field">
            <label for="bf-email">Email</label>
            <input type="email" id="bf-email" placeholder="you@example.com" required />
          </div>
          <div class="field field--full">
            <label for="bf-notes">What would you like to buy or ask?</label>
            <textarea id="bf-notes" rows="3" placeholder="e.g. 500g cardamom, shipping to Bengaluru" required></textarea>
          </div>
        </div>
        <button class="btn btn--primary btn--block" type="submit">Send enquiry</button>
        <p class="book__note">We'll pass your enquiry to ${l.host}.</p>
      </form>`;
  }

  function wireBookingForm(l) {
    const form = $("#bookForm");
    const totalEl = $("#bf-total");
    const labelEl = $("#bf-total-label");

    function compute() {
      const guests = Math.max(1, parseInt($("#bf-guests").value || "1", 10));
      if (l.type === "homestay") {
        const a = $("#bf-date").value, b = $("#bf-out").value;
        if (a && b && new Date(b) > new Date(a)) {
          const nights = Math.round((new Date(b) - new Date(a)) / 86400000);
          totalEl.textContent = money(nights * l.price);
          labelEl.textContent = `${nights} night${nights > 1 ? "s" : ""} × ${money(l.price)}`;
          return nights * l.price;
        }
        totalEl.textContent = money(l.price);
        labelEl.textContent = "Estimated total";
        return l.price;
      }
      if (l.unit === "person") {
        totalEl.textContent = money(guests * l.price);
        labelEl.textContent = `${guests} × ${money(l.price)} per person`;
        return guests * l.price;
      }
      totalEl.textContent = money(l.price);
      labelEl.textContent = "Total";
      return l.price;
    }

    form.addEventListener("input", compute);
    compute();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const total = compute();
      const booking = {
        id: ref(), listingId: l.id, listingName: l.name, type: l.type, host: l.host,
        name: $("#bf-name").value.trim(), email: $("#bf-email").value.trim(), phone: $("#bf-phone").value.trim(),
        date: $("#bf-date").value, checkOut: l.type === "homestay" ? $("#bf-out").value : "",
        guests: parseInt($("#bf-guests").value || "1", 10), total,
        notes: $("#bf-notes").value.trim(), createdAt: new Date().toISOString(),
      };
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "Sending…";

      let saved = false;
      if (state.usingApi) {
        try {
          const res = await fetch(API + "/api/bookings", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(booking),
          });
          saved = res.ok;
        } catch (_) { saved = false; }
      }
      if (!saved) saveLocal(booking);
      showConfirmation(l, booking, saved);
    });
  }

  function wireEnquiryForm(l) {
    $("#bookForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const booking = {
        id: ref(), listingId: l.id, listingName: l.name, type: "enquiry", host: l.host,
        name: $("#bf-name").value.trim(), email: $("#bf-email").value.trim(),
        notes: $("#bf-notes").value.trim(), createdAt: new Date().toISOString(),
      };
      saveLocal(booking);
      showConfirmation(l, booking, false, true);
    });
  }

  function saveLocal(booking) {
    try {
      const all = JSON.parse(localStorage.getItem("nt_bookings") || "[]");
      all.push(booking);
      localStorage.setItem("nt_bookings", JSON.stringify(all));
    } catch (_) { /* storage may be unavailable */ }
  }

  function showConfirmation(l, b, savedToApi, isEnquiry) {
    const rows = [
      ["Reference", b.id],
      ["Listing", b.listingName],
      ["Host", b.host],
      isEnquiry ? ["Type", "Enquiry"] : ["Date", b.date + (b.checkOut ? " → " + b.checkOut : "")],
      !isEnquiry && b.guests ? ["Guests", b.guests] : null,
      !isEnquiry && b.total ? ["Total", money(b.total)] : null,
      ["Name", b.name],
      ["Email", b.email],
    ].filter(Boolean);

    $("#modalBody").innerHTML = `
      <div class="detail__inner">
        <div class="confirm">
          <div class="confirm__tick">✓</div>
          <h3>${isEnquiry ? "Enquiry sent" : "Booking requested"}</h3>
          <p>${isEnquiry
            ? `Your enquiry has been passed to ${l.host}. They'll reply to ${b.email} shortly.`
            : `Thanks ${b.name.split(" ")[0] || ""}! ${l.host} will confirm your dates at ${b.email} shortly.`}</p>
          <div class="confirm__ref">${b.id}</div>
          <div class="confirm__rows">
            ${rows.map((r) => `<div><span>${r[0]}</span><span>${r[1]}</span></div>`).join("")}
          </div>
          <p class="book__note">${savedToApi
            ? "Saved to the booking server."
            : "Saved on this device. Start the Node server to persist bookings centrally."}</p>
          <button class="btn btn--ghost" data-close style="margin-top:16px">Close</button>
        </div>
      </div>`;
  }

  /* ---------------- modal plumbing ---------------- */

  function openModal() {
    $("#modal").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    $("#modal").hidden = true;
    document.body.style.overflow = "";
    $("#modalBody").innerHTML = "";
  }

  /* ---------------- events ---------------- */

  function wireEvents() {
    $("#listingGrid").addEventListener("click", (e) => {
      const target = e.target.closest("[data-id]");
      if (target) openListing(target.dataset.id);
    });

    // map popup "View & book" buttons
    $("#map").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-open]");
      if (btn) openListing(btn.dataset.open);
    });

    $("#searchForm").addEventListener("submit", (e) => {
      e.preventDefault();
      state.region = $("#regionSelect").value;
      state.type = $("#typeSelect").value;
      state.query = $("#queryInput").value;
      $$(".filter").forEach((f) => f.classList.toggle("is-active", f.dataset.type === state.type));
      render();
      document.getElementById("listings").scrollIntoView({ behavior: "smooth" });
    });

    $$(".nav__links a").forEach((a) => a.addEventListener("click", () => {
      state.type = a.dataset.jump;
      $$(".filter").forEach((f) => f.classList.toggle("is-active", f.dataset.type === state.type));
      render();
    }));

    $("#nearMeBtn").addEventListener("click", locate);
    $("#heroNearBtn").addEventListener("click", () => {
      document.getElementById("listings").scrollIntoView({ behavior: "smooth" });
      locate();
    });

    $("#sortGroup").addEventListener("click", (e) => {
      const b = e.target.closest(".sort__btn");
      if (!b || b.disabled) return;
      state.sort = b.dataset.sort;
      $$(".sort__btn").forEach((x) => x.classList.toggle("is-active", x === b));
      render();
    });

    $("#modal").addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#modal").hidden) closeModal();
    });

    $("#hostCta").addEventListener("click", (e) => {
      e.preventDefault();
      toast("Thanks! Onboarding for hosts opens soon — this is a demo.");
    });
  }

  boot();
})();
