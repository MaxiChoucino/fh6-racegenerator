const STORAGE = {
  cache: "fh6_random_car_cache_v2", excluded: "fh6_random_excluded_v1",
  currentCar: "fh6_random_current_car_v1", currentRace: "fh6_random_current_race_v1"
};
const RACE_TYPES = {
  Road: "Asfalto", Dirt: "Tierra", "Cross Country": "Campo traviesa",
  Street: "Callejera", Touge: "Touge", Drag: "Aceleración", "Time Attack": "Contrarreloj", "Drift Attack": "Drift Attack"
};
const $ = id => document.getElementById(id);
let allCars = [];
let currentCar = null;
let currentRace = null;
let deferredInstallPrompt = null;
let listSource = "lista incluida";
let catalogSync = null;
let syncTimer = null;
let photoVersion = 0;
let pendingPhoto = null;
let photoTimer = null;
let mapLoaded = false;
let mapZoom = 1;

function readStorage(key, fallback = "") {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch { /* La sesión sigue disponible sin almacenamiento. */ }
}
function uniqueSorted(items) {
  return [...new Set(items.filter(x => typeof x === "string").map(x => x.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
function getExcluded() {
  try {
    const saved = JSON.parse(readStorage(STORAGE.excluded, "[]"));
    return new Set(Array.isArray(saved) ? saved.filter(x => typeof x === "string") : []);
  } catch { return new Set(); }
}
function saveExcluded(set) {
  writeStorage(STORAGE.excluded, JSON.stringify([...set]));
  updateExcludedCount();
  updateStatus();
}
function availableCars() {
  const excluded = new Set([...getExcluded()].map(carIdentity));
  return allCars.filter(car => !excluded.has(carIdentity(car)));
}
function randomDifferent(list, previous) {
  const alternatives = list.filter(item => item !== previous);
  const pool = alternatives.length ? alternatives : list;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
function normalizedCar(name) {
  return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
const photoIndex = new Map(Object.entries(window.FH6_CAR_PHOTOS || {}).map(([name, photo]) => [normalizedCar(name), photo]));
const profileIndex = new Map(Object.entries(window.FH6_CAR_PROFILES || {}));
function carIdentity(name) {
  return photoIndex.get(normalizedCar(name))?.url.split("/images/")[1] || normalizedCar(name);
}

function showCarPhoto(name) {
  const version = ++photoVersion;
  clearTimeout(photoTimer);
  if (pendingPhoto) { pendingPhoto.onload = null; pendingPhoto.onerror = null; pendingPhoto = null; }
  const image = $("carImage");
  image.hidden = true;
  image.removeAttribute("src");
  image.alt = name ? `Foto de ${name}` : "";
  $("carPhotoCredit").hidden = true;
  $("carPhotoCredit").removeAttribute("href");
  $("carImageStatus").hidden = false;
  const photo = name && photoIndex.get(normalizedCar(name));
  if (!photo?.url) {
    $("carImageStatus").textContent = name ? "Todavía no hay una foto de este modelo." : "Restaurá un auto de tu garaje para seguir.";
    return;
  }
  $("carImageStatus").textContent = "Cargando foto del auto…";
  const preload = new Image();
  pendingPhoto = preload;
  const failed = () => {
    if (version !== photoVersion) return;
    clearTimeout(photoTimer);
    preload.onload = null;
    preload.onerror = null;
    $("carImageStatus").textContent = navigator.onLine
      ? "No se pudo cargar la foto. Probá de nuevo con conexión."
      : "Foto no guardada. Conectate para verla.";
  };
  preload.onload = () => {
    if (version !== photoVersion) return;
    clearTimeout(photoTimer);
    image.src = photo.url;
    image.hidden = false;
    $("carImageStatus").hidden = true;
    $("carPhotoCredit").textContent = `Foto · ${photo.sourceName || "Forza Wiki / forzadata"}`;
    $("carPhotoCredit").href = photo.sourceUrl || "https://github.com/pixelswiftali/forzadata";
    $("carPhotoCredit").hidden = false;
    pendingPhoto = null;
    // La primera foto puede cargarse antes de que el service worker tome control.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.active?.postMessage({ type: "CACHE_PHOTO", url: photo.url });
      }).catch(() => {});
    }
  };
  preload.onerror = failed;
  photoTimer = setTimeout(failed, 12000);
  preload.src = photo.url;
}
function setCar(name) {
  const changed = currentCar !== name;
  currentCar = name;
  $("carName").textContent = name || "Sin autos disponibles";
  $("carDetail").textContent = name ? "Tu auto para la próxima salida" : "Todos tus autos están excluidos";
  $("dontHaveBtn").disabled = !name;
  writeStorage(STORAGE.currentCar, name || "");
  if (changed || !name) showCarPhoto(name);
  updateCarGuidance();
}
function currentCarProfile() {
  if (!currentCar) return null;
  const key = normalizedCar(currentCar);
  const exact = profileIndex.get(key);
  if (exact?.category) return exact;
  const identity = carIdentity(currentCar);
  for (const [alias, profile] of profileIndex) {
    if (profile.category && carIdentity(alias) === identity) return FH6Suitability.combine(profile, exact);
  }
  return exact || null;
}
function updateCarGuidance() {
  $("carGuidance").hidden = !currentCar;
  $("raceFit").hidden = !currentCar || !currentRace;
  const profile = currentCarProfile();
  const result = FH6Suitability.assess(profile, currentRace?.type);
  const tags = $("carRaceTypes");
  tags.replaceChildren();
  if (currentCar) $("carDetail").textContent = result.group ? result.label + " · perfil de serie" : "Perfil todavía no disponible";
  if (!result.types.length) {
    const text = document.createElement("span");
    text.className = "guidance-unknown";
    text.textContent = "Sin datos suficientes para recomendar un tipo de carrera.";
    tags.append(text);
  }
  for (const type of result.types) {
    const chip = document.createElement("span");
    chip.className = "race-affinity-tag";
    chip.textContent = FH6Suitability.LABELS[type];
    if (type === currentRace?.type) { chip.classList.add("is-selected"); chip.textContent += " · esta carrera"; }
    tags.append(chip);
  }
  $("raceFit").dataset.level = result.level;
  $("raceFitTitle").textContent = result.title;
  $("raceFitReason").textContent = result.reason;
}
function validMapPosition(race) {
  return Number.isFinite(race?.map?.x) && Number.isFinite(race?.map?.y)
    && race.map.x >= 0 && race.map.x <= 100 && race.map.y >= 0 && race.map.y <= 100;
}
function positionMarker(marker, race) {
  const valid = validMapPosition(race);
  marker.hidden = !valid || !mapLoaded;
  if (valid) {
    marker.style.left = `${race.map.x}%`;
    marker.style.top = `${race.map.y}%`;
    marker.setAttribute("aria-label", `Ubicación de ${race.name}`);
  }
}
function updateMap() {
  positionMarker($("raceMapMarker"), currentRace);
  positionMarker($("mapDialogMarker"), currentRace);
  $("raceMapImage").alt = currentRace ? `Mapa de Forza Horizon 6: ubicación de ${currentRace.name}` : "Mapa de Forza Horizon 6";
  $("mapDialogImage").alt = $("raceMapImage").alt;
  $("mapDialogTitle").textContent = currentRace?.name || "Mapa de Horizon Japón";
  $("raceMapStatus").textContent = !mapLoaded ? "Cargando mapa…"
    : currentRace?.mapNote || (validMapPosition(currentRace) ? "El marcador señala el inicio de la carrera." : "Ubicación de esta carrera aún no disponible.");
  $("expandMapBtn").disabled = !mapLoaded;
}
function setRace(race) {
  currentRace = race;
  $("raceName").textContent = race?.name || "Sin carreras disponibles";
  $("raceType").textContent = RACE_TYPES[race?.type] || race?.type || "Carrera";
  $("raceType").dataset.type = race?.type || "";
  $("raceMapLink").href = race?.sourceUrl || "https://forza.labsgg.com/interactive-map";
  $("raceMapLink").hidden = !race;
  writeStorage(STORAGE.currentRace, race?.name || "");
  updateMap();
  updateCarGuidance();
}
function zoomMap(value) {
  mapZoom = Math.max(1, Math.min(4, value));
  $("mapDialogFrame").style.width = `${mapZoom * 100}%`;
  $("mapZoomLabel").textContent = `${Math.round(mapZoom * 100)}%`;
  $("mapZoomOut").disabled = mapZoom <= 1;
  $("mapZoomIn").disabled = mapZoom >= 4;
  // Mantener a la vista la ubicación elegida, también en pantallas pequeñas.
  if (validMapPosition(currentRace)) {
    const viewport = $("mapViewport");
    viewport.scrollLeft = $("mapDialogFrame").offsetWidth * currentRace.map.x / 100 - viewport.clientWidth / 2;
    viewport.scrollTop = $("mapDialogFrame").offsetHeight * currentRace.map.y / 100 - viewport.clientHeight / 2;
  }
}
function newCar() { setCar(randomDifferent(availableCars(), currentCar)); updateStatus(); }
function newRace() { setRace(randomDifferent(window.FH6_RACES || [], currentRace)); }
function newBoth() { newCar(); newRace(); }
function markDontHave() {
  if (!currentCar) return;
  const excluded = getExcluded();
  excluded.add(currentCar);
  saveExcluded(excluded);
  newCar();
}
function updateExcludedCount() { $("excludedCount").textContent = getExcluded().size; }
function updateStatus() {
  $("status").textContent = !availableCars().length
    ? "No quedan autos: restaurá alguno desde Autos excluidos."
    : `${allCars.length} autos · ${(window.FH6_RACES || []).length} carreras · ${listSource}`;
}
function renderExcluded() {
  const list = $("excludedList");
  const excluded = [...getExcluded()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  list.replaceChildren();
  $("restoreAllBtn").disabled = !excluded.length;
  if (!excluded.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Todavía no excluiste ningún auto.";
    list.append(empty);
  }
  for (const name of excluded) {
    const row = document.createElement("div");
    row.className = "excluded-item";
    const label = document.createElement("span");
    label.textContent = name;
    const button = document.createElement("button");
    button.className = "restore-one";
    button.textContent = "Restaurar";
    button.setAttribute("aria-label", `Restaurar ${name}`);
    button.addEventListener("click", () => {
      const saved = getExcluded();
      saved.delete(name);
      saveExcluded(saved);
      renderExcluded();
      if (!currentCar) newCar();
    });
    row.append(label, button);
    list.append(row);
  }
}
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
function readCache() {
  try {
    const parsed = JSON.parse(readStorage(STORAGE.cache, "null"));
    return Array.isArray(parsed?.cars) && uniqueSorted(parsed.cars).length ? parsed : null;
  } catch { return null; }
}
function restoreOrRandomize() {
  const pool = availableCars();
  if (!currentCar || !pool.includes(currentCar)) {
    const savedCar = readStorage(STORAGE.currentCar);
    const equivalent = pool.find(name => carIdentity(name) === carIdentity(savedCar));
    if (equivalent) setCar(equivalent);
    else newCar();
  }
  if (!currentRace) {
    const savedRace = readStorage(STORAGE.currentRace);
    setRace((window.FH6_RACES || []).find(race => race.name === savedRace) || randomDifferent(window.FH6_RACES || [], null));
  }
}
function formatSyncTime(label, entry) {
  const date = value => new Date(value).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const checked = entry.checkedAt ? "consulta " + date(entry.checkedAt) : "todavía sin consultar";
  const updated = entry.sourceUpdatedAt ? " · fuente " + new Date(entry.sourceUpdatedAt).toLocaleDateString("es") : "";
  return label + ": " + checked + updated + (entry.failed ? " · no se pudo actualizar" : "");
}
function scheduleSync(snapshot) {
  clearTimeout(syncTimer);
  if (snapshot.busy || document.hidden || !navigator.onLine) return;
  syncTimer = setTimeout(() => catalogSync.refresh(), Math.max(1000, snapshot.nextAt - Date.now()));
}
function applyCatalogSnapshot(snapshot) {
  const oldPhoto = currentCar && photoIndex.get(normalizedCar(currentCar))?.url;
  for (const [name, photo] of Object.entries(snapshot.photos)) photoIndex.set(normalizedCar(name), photo);
  for (const [name, profile] of Object.entries(snapshot.profiles || {})) {
    profileIndex.set(name, FH6Suitability.combine(profileIndex.get(name), profile));
  }
  allCars = snapshot.cars.items;
  window.FH6_RACES = snapshot.races.items;
  if (currentRace) {
    const refreshed = window.FH6_RACES.find(race => FH6CatalogSync.raceKey(race.name) === FH6CatalogSync.raceKey(currentRace.name));
    if (refreshed) setRace(refreshed);
  }
  restoreOrRandomize();
  updateCarGuidance();
  if (currentCar && oldPhoto !== photoIndex.get(normalizedCar(currentCar))?.url) showCarPhoto(currentCar);
  listSource = !navigator.onLine ? "sin conexión · datos guardados"
    : snapshot.cars.failed || snapshot.races.failed ? "últimos datos disponibles"
    : snapshot.cars.checkedAt || snapshot.races.checkedAt ? "datos sincronizados" : "lista incluida";
  $("refreshBtn").disabled = snapshot.busy;
  $("refreshBtn").textContent = snapshot.busy ? "Actualizando…" : "Actualizar datos";
  $("carsSyncTime").textContent = formatSyncTime("Autos", snapshot.cars);
  $("racesSyncTime").textContent = formatSyncTime("Carreras", snapshot.races);
  $("carsSyncTime").title = "Fuente: " + snapshot.cars.source;
  $("racesSyncTime").title = "Fuente: " + snapshot.races.source;
  $("syncStatus").textContent = !navigator.onLine ? "Sin conexión. Conservamos tus listas y reintentamos al volver."
    : snapshot.busy ? "Consultando autos y carreras…"
    : snapshot.cars.failed || snapshot.races.failed ? "Una fuente no respondió. Conservamos sus datos y reintentamos en 15 minutos."
    : snapshot.cars.checkedAt && snapshot.races.checkedAt ? "Consulta completada. Tus selecciones y exclusiones se mantienen."
    : "Preparando la próxima consulta automática.";
  updateStatus();
  scheduleSync(snapshot);
}
function setupEvents() {
  $("newCarBtn").addEventListener("click", newCar);
  $("newRaceBtn").addEventListener("click", newRace);
  $("newBothBtn").addEventListener("click", newBoth);
  $("dontHaveBtn").addEventListener("click", markDontHave);
  $("refreshBtn").addEventListener("click", () => catalogSync.refresh({ force: true }));
  $("manageBtn").addEventListener("click", () => { renderExcluded(); $("manageDialog").showModal(); });
  $("closeDialogBtn").addEventListener("click", () => $("manageDialog").close());
  $("restoreAllBtn").addEventListener("click", () => {
    saveExcluded(new Set());
    renderExcluded();
    if (!currentCar) newCar();
  });
  $("expandMapBtn").addEventListener("click", () => { $("mapDialog").showModal(); zoomMap(1); });
  $("closeMapBtn").addEventListener("click", () => $("mapDialog").close());
  $("mapZoomIn").addEventListener("click", () => zoomMap(mapZoom + .5));
  $("mapZoomOut").addEventListener("click", () => zoomMap(mapZoom - .5));
  $("mapResetBtn").addEventListener("click", () => zoomMap(1));
  $("raceMapImage").addEventListener("load", () => { mapLoaded = true; updateMap(); });
  $("raceMapImage").addEventListener("error", () => {
    mapLoaded = false;
    updateMap();
    $("raceMapStatus").textContent = "No se pudo cargar el mapa. Abrí el mapa online.";
  });
  mapLoaded = $("raceMapImage").complete && $("raceMapImage").naturalWidth > 0;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $("installBtn").classList.remove("hidden");
  });
  $("installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    await deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("installBtn").classList.add("hidden");
  });
  window.addEventListener("online", () => {
    if (currentCar) showCarPhoto(currentCar);
    const snapshot = catalogSync.snapshot();
    catalogSync.refresh({ force: snapshot.cars.failed || snapshot.races.failed });
  });
  window.addEventListener("offline", () => applyCatalogSnapshot(catalogSync.snapshot()));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimeout(syncTimer);
    else catalogSync.refresh();
  });
}
function init() {
  const cache = readCache();
  catalogSync = FH6CatalogSync.create({
    cars: uniqueSorted(cache?.cars || window.FH6_BUNDLED_CARS || []),
    races: window.FH6_RACES || [], photos: window.FH6_CAR_PHOTOS || {},
    storage: { getItem: key => readStorage(key, null), setItem: writeStorage },
    fetchJson, isOnline: () => navigator.onLine, onChange: applyCatalogSnapshot
  });
  setupEvents();
  updateExcludedCount();
  applyCatalogSnapshot(catalogSync.snapshot());
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  catalogSync.refresh();
}
init();
