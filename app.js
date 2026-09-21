const ORDINALS_URL = "https://gist.githubusercontent.com/HDR/0659d1717bc61504bf83750628963f4f/raw/Forza%20Horizon%206%20Car%20Ordinals.json";
const CATALOG_URL = "https://raw.githubusercontent.com/pixelswiftali/forzadata/main/cars.json";
const STORAGE = {
  cache: "fh6_random_car_cache_v2", excluded: "fh6_random_excluded_v1",
  currentCar: "fh6_random_current_car_v1", currentRace: "fh6_random_current_race_v1"
};
const RACE_TYPES = {
  Road: "Asfalto", Dirt: "Tierra", "Cross Country": "Campo traviesa",
  Street: "Callejera", Touge: "Touge", Drag: "Aceleración", "Time Attack": "Contrarreloj"
};
const $ = id => document.getElementById(id);
let allCars = [];
let currentCar = null;
let currentRace = null;
let deferredInstallPrompt = null;
let listSource = "lista incluida";
let refreshInProgress = false;
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
function parseOrdinals(data) {
  return data && !Array.isArray(data) && typeof data === "object"
    ? Object.keys(data).filter(name => /^\d{4}\s+/.test(name) && !/\(Traffic\)|Unobtainable/i.test(name)) : [];
}
function catalogName(car) {
  return car.year && car.title ? `${car.year} ${car.title.replace(/ \(\d{4}\)$/, "")}` : car.full_name;
}
function parseCatalog(data) {
  if (!Array.isArray(data?.cars)) return [];
  return data.cars.map(catalogName);
}
function updatePhotoIndex(data) {
  for (const car of data.cars || []) {
    const name = catalogName(car);
    const path = car.image?.local_path;
    if (!name || photoIndex.has(normalizedCar(name)) || !/^images\/[a-z0-9_-]+\.png$/i.test(path || "")) continue;
    photoIndex.set(normalizedCar(name), {
      url: `https://raw.githubusercontent.com/pixelswiftali/forzadata/main/${path}`,
      sourceUrl: "https://github.com/pixelswiftali/forzadata", sourceName: "Forza Wiki / forzadata"
    });
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
async function loadCars() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "Actualizando…";
  try {
    // Preferimos el catálogo de modelos jugables con fotos y nombres completos.
    for (const [url, parse, source] of [[CATALOG_URL, parseCatalog, "online"], [ORDINALS_URL, parseOrdinals, "online alternativo"]]) {
      try {
        const data = await fetchJson(url);
        const cars = uniqueSorted(parse(data));
        if (cars.length < 100) continue;
        if (url === CATALOG_URL) updatePhotoIndex(data);
        allCars = cars;
        listSource = source;
        writeStorage(STORAGE.cache, JSON.stringify({ cars, source, savedAt: new Date().toISOString() }));
        restoreOrRandomize();
        return;
      } catch { /* La selección sigue utilizable mientras se intenta otra fuente. */ }
    }
    listSource = readCache() ? "sin conexión · lista guardada" : "sin conexión · lista incluida";
  } finally {
    refreshInProgress = false;
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "Actualizar autos";
    updateStatus();
  }
}
function setupEvents() {
  $("newCarBtn").addEventListener("click", newCar);
  $("newRaceBtn").addEventListener("click", newRace);
  $("newBothBtn").addEventListener("click", newBoth);
  $("dontHaveBtn").addEventListener("click", markDontHave);
  $("refreshBtn").addEventListener("click", loadCars);
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
  window.addEventListener("online", () => { if (currentCar) showCarPhoto(currentCar); loadCars(); });
}
function init() {
  setupEvents();
  updateExcludedCount();
  const cache = readCache();
  allCars = uniqueSorted(cache?.cars || window.FH6_BUNDLED_CARS || []);
  listSource = cache ? "lista guardada" : "lista incluida";
  restoreOrRandomize();
  updateStatus();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  loadCars();
}
init();
