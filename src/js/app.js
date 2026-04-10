// SkyTrace — Flight Tracker App
// Uses OpenSky Network public API (no API key needed)

const OPENSKY_URL = "https://opensky-network.org/api/states/all";
const PROXIES = [
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?",
  "https://proxy.cors.sh/",
];
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
    let res = null;
    for (const proxy of PROXIES) {
      try {
        res = await fetch(proxy + encodeURIComponent(OPENSKY_URL), { signal: AbortSignal.timeout(8000) });
        if (res.ok) break;
      } catch(e) { continue; }
    }
    if (!res || !res.ok) throw new Error("All proxies failed");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allFlights = (data.states || []).map(s => ({
      icao24:    s[0],
      callsign:  (s[1] || "").trim() || "UNKNOWN",
      country:   s[2] || "Unknown",
      lon:       s[5],
      lat:       s[6],
      altitude:  s[7],
      onGround:  s[8],
      velocity:  s[9],
      heading:   s[10],
      vertRate:  s[11],
    })).filter(f => f.lat !== null && f.lon !== null);

    renderPlanes(allFlights);
    updateStats(allFlights.length);
    hideLoading();
  } catch (err) {
    console.error("Failed to fetch flights:", err);
    document.getElementById("count-val").textContent = "ERR";
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
