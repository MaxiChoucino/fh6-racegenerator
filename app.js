
const PRIMARY_CARS_URL = "https://gist.githubusercontent.com/HDR/0659d1717bc61504bf83750628963f4f/raw/Forza%20Horizon%206%20Car%20Ordinals.json";
const SECONDARY_CARS_URL = "https://raw.githubusercontent.com/pixelswiftali/forzadata/main/cars.json";

const FALLBACK_CARS = [
  "1969 Toyota 2000 GT",
  "1964 Ferrari 250 GTO",
  "1954 Mercedes-Benz 300 SL",
  "1994 Ferrari F355 Berlinetta",
  "1991 Ferrari 512 TR",
  "1973 Porsche 911 Carrera RS",
  "1995 Porsche 911 GT2",
  "2004 Porsche 911 GT3",
  "1982 Porsche 911 Turbo",
  "1989 Porsche 944 Turbo",
  "1987 Porsche 959",
  "1968 Plymouth Barracuda",
  "1969 Chevrolet Camaro SS",
  "2003 Porsche Carrera GT",
  "2003 Toyota Celica SS-I",
  "1998 TVR Cerbera",
  "1970 Chevrolet Chevelle",
  "2004 Honda Civic Type R",
  "1965 Shelby Cobra 427",
  "2017 Aston Martin DB11",
  "1968 Abarth 595 esseesse",
  "2016 Abarth 695 Biposto",
  "1980 Abarth Fiat 131"
];

const STORAGE = {
  cache: "fh6_random_car_cache_v2",
  excluded: "fh6_random_excluded_v1",
  currentCar: "fh6_random_current_car_v1",
  currentRace: "fh6_random_current_race_v1"
};

let allCars = [];
let currentCar = null;
let currentRace = null;
let deferredInstallPrompt = null;

const $ = (id) => document.getElementById(id);

function uniqueSorted(items) {
  return [...new Set(items.filter(Boolean).map(x => String(x).trim()))]
    .filter(Boolean)
    .sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
}

function getExcluded() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE.excluded) || "[]")); }
  catch { return new Set(); }
}

function saveExcluded(set) {
  localStorage.setItem(STORAGE.excluded, JSON.stringify([...set]));
  updateExcludedCount();
}

function availableCars() {
  const excluded = getExcluded();
  return allCars.filter(c => !excluded.has(c));
}

function randomDifferent(list, previous) {
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  let next = previous;
  while (next === previous) next = list[Math.floor(Math.random() * list.length)];
  return next;
}

function setCar(name) {
  currentCar = name;
  $("carName").textContent = name || "Sin autos disponibles";
  $("dontHaveBtn").disabled = !name;
  localStorage.setItem(STORAGE.currentCar, name || "");
}

function setRace(race) {
  currentRace = race;
  $("raceName").textContent = race?.name || "—";
  localStorage.setItem(STORAGE.currentRace, race?.name || "");
}

function newCar() {
  const pool = availableCars();
  if (!pool.length) {
    setCar(null);
    $("status").textContent = "No quedan autos: restaurá alguno desde Autos excluidos.";
    return;
  }
  setCar(randomDifferent(pool, currentCar));
}

function newRace() {
  setRace(randomDifferent(window.FH6_RACES || [], currentRace));
}

function newBoth() {
  newCar();
  newRace();
}

function markDontHave() {
  if (!currentCar) return;
  const excluded = getExcluded();
  excluded.add(currentCar);
  saveExcluded(excluded);
  newCar();
}

function updateExcludedCount() {
  $("excludedCount").textContent = getExcluded().size;
}

function renderExcluded() {
  const list = $("excludedList");
  const excluded = [...getExcluded()].sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
  list.innerHTML = "";

  if (!excluded.length) {
    list.innerHTML = '<div class="empty">Todavía no excluiste ningún auto.</div>';
    $("restoreAllBtn").disabled = true;
    return;
  }
  $("restoreAllBtn").disabled = false;

  excluded.forEach(name => {
    const row = document.createElement("div");
    row.className = "excluded-item";

    const label = document.createElement("span");
    label.textContent = name;

    const btn = document.createElement("button");
    btn.className = "restore-one";
    btn.textContent = "Restaurar";
    btn.addEventListener("click", () => {
      const set = getExcluded();
      set.delete(name);
      saveExcluded(set);
      renderExcluded();
      if (!currentCar) newCar();
    });

    row.append(label, btn);
    list.appendChild(row);
  });
}

function parsePrimary(data) {
  if (!data || Array.isArray(data) || typeof data !== "object") return [];
  // Este gist es un objeto { "Año Marca Modelo": "ordinal" }
  return Object.keys(data).filter(name => /^\d{4}\s+/.test(name));
}

function parseSecondary(data) {
  if (!Array.isArray(data?.cars)) return [];
  return data.cars.map(c => c.full_name || (c.year && c.title ? `${c.year} ${c.title}` : c.title));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {cache:"no-store", signal:controller.signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.cache) || "null");
    return Array.isArray(parsed?.cars) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(cars, source) {
  localStorage.setItem(STORAGE.cache, JSON.stringify({
    cars,
    source,
    savedAt: new Date().toISOString()
  }));
}

function statusText(source) {
  const excluded = getExcluded().size;
  return `${allCars.length} autos • ${window.FH6_RACES.length} carreras • ${source}${excluded ? ` • ${excluded} excluidos` : ""}`;
}

async function loadCars(force = false) {
  $("refreshBtn").disabled = true;
  $("status").textContent = force ? "Actualizando autos…" : "Cargando autos…";

  if (!force) {
    const cache = readCache();
    if (cache?.cars?.length) {
      allCars = uniqueSorted(cache.cars);
      $("status").textContent = statusText("caché");
      restoreOrRandomize();
      // Sigue intentando actualizar silenciosamente.
      updateFromNetwork(true);
      $("refreshBtn").disabled = false;
      return;
    }
  }

  await updateFromNetwork(false);
  $("refreshBtn").disabled = false;
}

async function updateFromNetwork(silent = false) {
  try {
    const primaryData = await fetchJson(PRIMARY_CARS_URL);
    const cars = uniqueSorted(parsePrimary(primaryData));
    if (cars.length < 100) throw new Error("Lista primaria demasiado corta");
    allCars = cars;
    writeCache(cars, "HDR Car Ordinals");
    $("status").textContent = statusText("online");
    restoreOrRandomize();
    return;
  } catch (primaryError) {
    try {
      const secondaryData = await fetchJson(SECONDARY_CARS_URL);
      const cars = uniqueSorted(parseSecondary(secondaryData));
      if (cars.length < 100) throw new Error("Lista secundaria demasiado corta");
      allCars = cars;
      writeCache(cars, "forzadata");
      $("status").textContent = statusText("online alternativo");
      restoreOrRandomize();
      return;
    } catch (secondaryError) {
      const cache = readCache();
      if (cache?.cars?.length) {
        allCars = uniqueSorted(cache.cars);
        $("status").textContent = statusText("offline • última lista guardada");
        restoreOrRandomize();
      } else {
        allCars = FALLBACK_CARS;
        $("status").textContent = statusText("offline • lista de emergencia");
        restoreOrRandomize();
      }
      if (!silent) console.warn("No se pudo actualizar la lista online.", primaryError, secondaryError);
    }
  }
}

function restoreOrRandomize() {
  const savedCar = localStorage.getItem(STORAGE.currentCar);
  const savedRaceName = localStorage.getItem(STORAGE.currentRace);
  const excluded = getExcluded();

  if (!currentCar) {
    if (savedCar && allCars.includes(savedCar) && !excluded.has(savedCar)) setCar(savedCar);
    else newCar();
  }

  if (!currentRace) {
    const found = (window.FH6_RACES || []).find(r => r.name === savedRaceName);
    if (found) setRace(found);
    else newRace();
  }
}

function setupEvents() {
  $("newCarBtn").addEventListener("click", newCar);
  $("newRaceBtn").addEventListener("click", newRace);
  $("newBothBtn").addEventListener("click", newBoth);
  $("dontHaveBtn").addEventListener("click", markDontHave);
  $("refreshBtn").addEventListener("click", () => loadCars(true));

  $("manageBtn").addEventListener("click", () => {
    renderExcluded();
    $("manageDialog").showModal();
  });
  $("closeDialogBtn").addEventListener("click", () => $("manageDialog").close());

  $("restoreAllBtn").addEventListener("click", () => {
    saveExcluded(new Set());
    renderExcluded();
    if (!currentCar) newCar();
    $("status").textContent = statusText("lista activa");
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $("installBtn").classList.remove("hidden");
  });

  $("installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("installBtn").classList.add("hidden");
  });
}

async function init() {
  setupEvents();
  updateExcludedCount();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  await loadCars(false);
}

init();
