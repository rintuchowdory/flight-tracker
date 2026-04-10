// SkyTrace — Flight Tracker App
// Uses OpenSky Network public API (no API key needed)

// Using adsb.lol - free, no key, CORS enabled
const REFRESH_INTERVAL = 30000; // 30 seconds

let map, planeLayerGroup;
let allFlights = [];
let refreshTimer;
let selectedIcao = null;

// ─── Initialize Map ───────────────────────────────────────────────────────────
function initMap() {
  map = L.map("map", {
    center: [20, 0],
    zoom: 3,
    zoomControl: false,
    attributionControl: false,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
  }).addTo(map);

  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.control.attribution({ position: "bottomleft", prefix: "© OpenStreetMap | OpenSky Network" }).addTo(map);

  planeLayerGroup = L.layerGroup().addTo(map);
}

// ─── Fetch Flights ────────────────────────────────────────────────────────────
async function fetchFlights() {
  setRefreshBtnSpinning(true);
  try {
    const res = await fetch("https://api.adsb.lol/v2/all", { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    allFlights = (data.ac || []).map(a => ({
      icao24:   a.hex || "",
      callsign: (a.flight || a.r || "UNKNOWN").trim(),
      country:  a.r || "Unknown",
      lon:      a.lon,
      lat:      a.lat,
      altitude: a.alt_baro || a.alt_geom || 0,
      onGround: a.alt_baro === "ground",
      velocity: a.gs || 0,
      heading:  a.track || 0,
      vertRate: a.baro_rate || 0,
    })).filter(f => f.lat && f.lon);

    renderPlanes(allFlights);
    updateStats(allFlights.length);
    hideLoading();
  } catch (err) {
    console.error("Failed to fetch flights:", err);
    // Load demo data so map is not empty
    allFlights = [
      {icao24:"3c6444",callsign:"DLH400",country:"Germany",lat:51.5,lon:8.2,altitude:10000,onGround:false,velocity:900,heading:270,vertRate:-1},
      {icao24:"4ca7a3",callsign:"RYR123",country:"Ireland",lat:48.2,lon:11.5,altitude:11000,onGround:false,velocity:850,heading:90,vertRate:0},
      {icao24:"406943",callsign:"BAW217",country:"UK",lat:53.4,lon:-2.2,altitude:9500,onGround:false,velocity:880,heading:180,vertRate:2},
      {icao24:"a12345",callsign:"UAL890",country:"USA",lat:40.6,lon:-73.8,altitude:12000,onGround:false,velocity:920,heading:45,vertRate:1},
      {icao24:"71be60",callsign:"AFR456",country:"France",lat:43.6,lon:1.4,altitude:10500,onGround:false,velocity:870,heading:315,vertRate:-2},
    ];
    renderPlanes(allFlights);
    updateStats("DEMO");
    hideLoading();
  } finally {
    setRefreshBtnSpinning(false);
  }
}

// ─── Render Planes ────────────────────────────────────────────────────────────
function renderPlanes(flights) {
  planeLayerGroup.clearLayers();

  flights.forEach(flight => {
    const icon = L.divIcon({
      html: `<div class="plane-marker" style="transform: rotate(${flight.heading || 0}deg)">✈</div>`,
      className: "",
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    const marker = L.marker([flight.lat, flight.lon], { icon })
      .addTo(planeLayerGroup);

    marker.on("click", () => showFlightPanel(flight));
  });
}

// ─── Flight Info Panel ────────────────────────────────────────────────────────
function showFlightPanel(flight) {
  selectedIcao = flight.icao24;
  const panel = document.getElementById("side-panel");
  const content = document.getElementById("panel-content");

  const alt = flight.altitude ? `${Math.round(flight.altitude).toLocaleString()} m` : "—";
  const spd = flight.velocity ? `${Math.round(flight.velocity * 1.944)} kts` : "—";
  const hdg = flight.heading !== null ? `${Math.round(flight.heading)}°` : "—";
  const vr  = flight.vertRate !== null ? `${Math.round(flight.vertRate)} m/s` : "—";
  const statusClass = flight.onGround ? "status-ground" : "status-airborne";
  const statusText  = flight.onGround ? "ON GROUND" : "AIRBORNE";

  content.innerHTML = `
    <div class="flight-card">
      <div class="callsign-display">${flight.callsign}</div>
      <div class="country-label">🌍 ${flight.country.toUpperCase()}</div>
      <span class="status-badge ${statusClass}">${statusText}</span>

      <div class="data-grid" style="margin-top:16px">
        <div class="data-cell">
          <span class="data-cell-label">ALTITUDE</span>
          <span class="data-cell-value">${alt}</span>
        </div>
        <div class="data-cell">
          <span class="data-cell-label">SPEED</span>
          <span class="data-cell-value">${spd}</span>
        </div>
        <div class="data-cell">
          <span class="data-cell-label">HEADING</span>
          <span class="data-cell-value">${hdg}</span>
        </div>
        <div class="data-cell">
          <span class="data-cell-label">VERT RATE</span>
          <span class="data-cell-value">${vr}</span>
        </div>
        <div class="data-cell">
          <span class="data-cell-label">LATITUDE</span>
          <span class="data-cell-value">${flight.lat.toFixed(4)}°</span>
        </div>
        <div class="data-cell">
          <span class="data-cell-label">LONGITUDE</span>
          <span class="data-cell-value">${flight.lon.toFixed(4)}°</span>
        </div>
      </div>

      <div class="data-cell" style="margin-bottom:8px">
        <span class="data-cell-label">ICAO24</span>
        <span class="data-cell-value">${flight.icao24.toUpperCase()}</span>
      </div>

      <a class="map-link"
         href="https://www.flightradar24.com/${flight.callsign}"
         target="_blank" rel="noopener">
        → TRACK ON FLIGHTRADAR24
      </a>
    </div>
  `;

  panel.classList.add("open");
  map.flyTo([flight.lat, flight.lon], Math.max(map.getZoom(), 5), { duration: 1.2 });
}

// ─── Search ───────────────────────────────────────────────────────────────────
function handleSearch() {
  const query = document.getElementById("search-input").value.trim().toLowerCase();
  if (!query) {
    renderPlanes(allFlights);
    return;
  }
  const filtered = allFlights.filter(f =>
    f.callsign.toLowerCase().includes(query) ||
    f.country.toLowerCase().includes(query) ||
    f.icao24.toLowerCase().includes(query)
  );
  renderPlanes(filtered);
  document.getElementById("count-val").textContent = filtered.length;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function updateStats(count) {
  document.getElementById("count-val").textContent = count.toLocaleString();
  const now = new Date();
  document.getElementById("update-val").textContent =
    now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function hideLoading() {
  document.getElementById("loading").classList.add("hidden");
}

function setRefreshBtnSpinning(yes) {
  const btn = document.getElementById("refresh-btn");
  yes ? btn.classList.add("spinning") : btn.classList.remove("spinning");
}

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(fetchFlights, REFRESH_INTERVAL);
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.getElementById("refresh-btn").addEventListener("click", () => {
  fetchFlights();
  startAutoRefresh();
});

document.getElementById("close-panel").addEventListener("click", () => {
  document.getElementById("side-panel").classList.remove("open");
  selectedIcao = null;
});

document.getElementById("search-btn").addEventListener("click", handleSearch);
document.getElementById("search-input").addEventListener("keydown", e => {
  if (e.key === "Enter") handleSearch();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
initMap();
fetchFlights();
startAutoRefresh();
