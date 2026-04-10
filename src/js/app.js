
const CLIENT_ID = "rintu-api-client";
const CLIENT_SECRET = "mmbolKN31P1b2FffVzFUUeThPxGbLJyJ";
const REFRESH_INTERVAL = 30000;
let accessToken = null;
let allFlights = [];
let refreshTimer;
let map, planeLayerGroup;

async function getToken() {
  try {
    const res = await fetch("https://flight-proxy-qn52.onrender.com/flights", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&client_id=" + CLIENT_ID + "&client_secret=" + CLIENT_SECRET
    });
    const data = await res.json();
    accessToken = data.access_token;
    console.log("Token OK");
  } catch(e) {
    console.error("Token error:", e);
    accessToken = null;
  }
}

function initMap() {
  map = L.map("map", { center: [20, 0], zoom: 3, zoomControl: false, attributionControl: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.control.attribution({ position: "bottomleft", prefix: "© OpenStreetMap | OpenSky Network" }).addTo(map);
  planeLayerGroup = L.layerGroup().addTo(map);
}

function loadDemoData() {
  allFlights = [
    {icao24:"3c6444",callsign:"DLH400",country:"Germany",lat:51.5,lon:8.2,altitude:10000,onGround:false,velocity:900,heading:270,vertRate:-1},
    {icao24:"4ca7a3",callsign:"RYR123",country:"Ireland",lat:48.2,lon:11.5,altitude:11000,onGround:false,velocity:850,heading:90,vertRate:0},
    {icao24:"406943",callsign:"BAW217",country:"UK",lat:53.4,lon:-2.2,altitude:9500,onGround:false,velocity:880,heading:180,vertRate:2},
    {icao24:"a12345",callsign:"UAL890",country:"USA",lat:40.6,lon:-73.8,altitude:12000,onGround:false,velocity:920,heading:45,vertRate:1},
    {icao24:"71be60",callsign:"AFR456",country:"France",lat:43.6,lon:1.4,altitude:10500,onGround:false,velocity:870,heading:315,vertRate:-2},
    {icao24:"b12345",callsign:"JAL516",country:"Japan",lat:35.6,lon:139.7,altitude:9800,onGround:false,velocity:910,heading:200,vertRate:0},
    {icao24:"c12345",callsign:"SIA321",country:"Singapore",lat:1.3,lon:103.8,altitude:11200,onGround:false,velocity:895,heading:30,vertRate:1},
    {icao24:"d12345",callsign:"QFA12",country:"Australia",lat:-33.9,lon:151.2,altitude:10800,onGround:false,velocity:875,heading:315,vertRate:-1},
    {icao24:"e12345",callsign:"EK201",country:"UAE",lat:25.2,lon:55.4,altitude:12000,onGround:false,velocity:930,heading:270,vertRate:0},
    {icao24:"f12345",callsign:"AAL100",country:"USA",lat:33.9,lon:-118.4,altitude:9200,onGround:false,velocity:860,heading:90,vertRate:2},
    {icao24:"g12345",callsign:"TK1",country:"Turkey",lat:41.0,lon:28.8,altitude:10600,onGround:false,velocity:885,heading:45,vertRate:-1},
    {icao24:"h12345",callsign:"KLM892",country:"Netherlands",lat:52.3,lon:4.8,altitude:11400,onGround:false,velocity:905,heading:225,vertRate:0},
    {icao24:"i12345",callsign:"DLH789",country:"Germany",lat:48.4,lon:11.8,altitude:8500,onGround:false,velocity:840,heading:135,vertRate:3},
    {icao24:"j12345",callsign:"IBE34",country:"Spain",lat:40.5,lon:-3.6,altitude:10200,onGround:false,velocity:870,heading:180,vertRate:-2},
    {icao24:"k12345",callsign:"CHH7312",country:"China",lat:39.9,lon:116.4,altitude:11000,onGround:false,velocity:915,heading:60,vertRate:0},
  ];
  renderPlanes(allFlights);
  updateStats("DEMO");
  hideLoading();
}

async function fetchFlights() {
  setRefreshBtnSpinning(true);
  try {
    if (!accessToken) await getToken();
    const res = await fetch("https://flight-proxy-qn52.onrender.com/flights", {
      headers: { "Authorization": "Bearer " + accessToken },
      signal: AbortSignal.timeout(10000)
    });
    if (res.status === 401) {
      accessToken = null;
      await getToken();
      throw new Error("Token refreshed, retry next cycle");
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    allFlights = (data.states || []).map(function(s) {
      return {
        icao24:   s[0],
        callsign: (s[1] || "UNKNOWN").trim(),
        country:  s[2] || "Unknown",
        lon:      s[5],
        lat:      s[6],
        altitude: s[7],
        onGround: s[8],
        velocity: s[9],
        heading:  s[10],
        vertRate: s[11],
      };
    }).filter(function(f) { return f.lat !== null && f.lon !== null; });
    renderPlanes(allFlights);
    updateStats(allFlights.length);
    hideLoading();
  } catch(err) {
    console.error("Failed to fetch flights:", err);
    loadDemoData();
  } finally {
    setRefreshBtnSpinning(false);
  }
}

function renderPlanes(flights) {
  planeLayerGroup.clearLayers();
  flights.forEach(function(flight) {
    var icon = L.divIcon({
      html: '<div class="plane-marker" style="transform:rotate(' + (flight.heading || 0) + 'deg)">&#9992;</div>',
      className: "", iconSize: [20,20], iconAnchor: [10,10],
    });
    var marker = L.marker([flight.lat, flight.lon], { icon: icon }).addTo(planeLayerGroup);
    marker.on("click", function() { showFlightPanel(flight); });
  });
}

function showFlightPanel(flight) {
  var alt  = flight.altitude ? Math.round(flight.altitude).toLocaleString() + " m" : "—";
  var spd  = flight.velocity ? Math.round(flight.velocity * 1.944) + " kts" : "—";
  var hdg  = flight.heading  !== null ? Math.round(flight.heading) + "°" : "—";
  var vr   = flight.vertRate !== null ? Math.round(flight.vertRate) + " m/s" : "—";
  var sc   = flight.onGround ? "status-ground" : "status-airborne";
  var st   = flight.onGround ? "ON GROUND" : "AIRBORNE";
  document.getElementById("panel-content").innerHTML =
    '<div class="flight-card">' +
    '<div class="callsign-display">' + flight.callsign + '</div>' +
    '<div class="country-label">' + flight.country.toUpperCase() + '</div>' +
    '<span class="status-badge ' + sc + '">' + st + '</span>' +
    '<div class="data-grid" style="margin-top:16px">' +
    '<div class="data-cell"><span class="data-cell-label">ALTITUDE</span><span class="data-cell-value">' + alt + '</span></div>' +
    '<div class="data-cell"><span class="data-cell-label">SPEED</span><span class="data-cell-value">' + spd + '</span></div>' +
    '<div class="data-cell"><span class="data-cell-label">HEADING</span><span class="data-cell-value">' + hdg + '</span></div>' +
    '<div class="data-cell"><span class="data-cell-label">VERT RATE</span><span class="data-cell-value">' + vr + '</span></div>' +
    '<div class="data-cell"><span class="data-cell-label">LAT</span><span class="data-cell-value">' + flight.lat.toFixed(4) + '</span></div>' +
    '<div class="data-cell"><span class="data-cell-label">LON</span><span class="data-cell-value">' + flight.lon.toFixed(4) + '</span></div>' +
    '</div>' +
    '<div class="data-cell" style="margin-top:8px"><span class="data-cell-label">ICAO24</span><span class="data-cell-value">' + flight.icao24.toUpperCase() + '</span></div>' +
    '</div>';
  document.getElementById("side-panel").classList.add("open");
  map.flyTo([flight.lat, flight.lon], Math.max(map.getZoom(), 5), { duration: 1.2 });
}

function handleSearch() {
  var query = document.getElementById("search-input").value.trim().toLowerCase();
  if (!query) { renderPlanes(allFlights); return; }
  var filtered = allFlights.filter(function(f) {
    return f.callsign.toLowerCase().includes(query) ||
           f.country.toLowerCase().includes(query) ||
           f.icao24.toLowerCase().includes(query);
  });
  renderPlanes(filtered);
  document.getElementById("count-val").textContent = filtered.length;
}

function updateStats(count) {
  document.getElementById("count-val").textContent = count;
  var now = new Date();
  document.getElementById("update-val").textContent = now.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
}

function hideLoading() {
  var el = document.getElementById("loading");
  if (el) el.classList.add("hidden");
}

function setRefreshBtnSpinning(yes) {
  var btn = document.getElementById("refresh-btn");
  if (yes) btn.classList.add("spinning");
  else btn.classList.remove("spinning");
}

document.getElementById("refresh-btn").addEventListener("click", function() {
  fetchFlights();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(fetchFlights, REFRESH_INTERVAL);
});

document.getElementById("close-panel").addEventListener("click", function() {
  document.getElementById("side-panel").classList.remove("open");
});

document.getElementById("search-btn").addEventListener("click", handleSearch);
document.getElementById("search-input").addEventListener("keydown", function(e) {
  if (e.key === "Enter") handleSearch();
});

initMap();
fetchFlights();
refreshTimer = setInterval(fetchFlights, REFRESH_INTERVAL);
