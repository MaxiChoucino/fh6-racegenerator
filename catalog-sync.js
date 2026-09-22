/* Public community feeds; no key or server required. Keep parsers strict and updates additive. */
(function (root) {
  "use strict";
  const fit = typeof module !== "undefined" && module.exports ? require("./car-suitability.js") : root.FH6Suitability;
  const INTERVAL_MS = 6 * 60 * 60 * 1000;
  const RETRY_MS = 15 * 60 * 1000;
  const CACHE_KEY = "fh6_random_catalog_sync_v1";
  const SOURCES = {
    cars: "https://raw.githubusercontent.com/pixelswiftali/forzadata/main/cars.json",
    recentCars: "https://raw.githubusercontent.com/Hx-zh/fh6-livery-viewer/main/cars.json",
    fallbackCars: "https://gist.githubusercontent.com/HDR/0659d1717bc61504bf83750628963f4f/raw/Forza%20Horizon%206%20Car%20Ordinals.json",
    races: "https://forza.labsgg.com/.netlify/functions/interactive-map-items"
  };
  const TYPES = {
    road_race: "Road", rally_race: "Dirt", cross_country_race: "Cross Country",
    street_race: "Street", touge_race: "Touge", drag_race: "Drag",
    time_attack: "Time Attack", drift_attack: "Drift Attack"
  };
  const normalize = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const validName = value => typeof value === "string" && value.trim().length > 0 && value.length <= 240;
  const validCar = value => validName(value) && /^\d{4}\s+\S/.test(value) && !/\bTraffic\b|Unobtainable|Playground Flatbed/i.test(value);
  const sorted = values => [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  function raceKey(name) {
    return normalize(name.replace(/\s*\(Touge\)$/i, "").replace(/(Time Attack) Track$/i, "$1").replace(/Alphine/i, "Alpine"));
  }
  function safePhoto(photo) {
    if (!photo || typeof photo.url !== "string") return false;
    try {
      const url = new URL(photo.url);
      return url.origin === "https://raw.githubusercontent.com" && !url.search && !url.hash
        && /^\/pixelswiftali\/forzadata\/[a-z0-9_-]+\/images\/[a-z0-9_-]+\.png$/i.test(url.pathname);
    } catch { return false; }
  }
  function photoIdentity(photo) { return safePhoto(photo) ? photo.url.split("/images/")[1] : null; }
  function parseCars(data) {
    if (!Array.isArray(data?.cars)) throw new Error("Formato de autos desconocido");
    const items = [];
    const photos = {};
    const profiles = {};
    for (const car of data.cars) {
      if (!car || typeof car !== "object") continue;
      const name = /^\d{4}$/.test(String(car.year)) && validName(car.title)
        ? `${car.year} ${car.title.trim().replace(/ \(\d{4}\)$/, "")}` : car.full_name;
      if (!validCar(name)) continue;
      items.push(name.trim());
      const profile = fit.extractProfile(car);
      if (profile) profiles[normalize(name)] = profile;
      if (/^images\/[a-z0-9_-]+\.png$/i.test(car.image?.local_path || "")) {
        photos[normalize(name)] = {
          url: `https://raw.githubusercontent.com/pixelswiftali/forzadata/main/${car.image.local_path}`,
          sourceUrl: "https://github.com/pixelswiftali/forzadata", sourceName: "Forza Wiki / forzadata"
        };
      }
    }
    if (items.length < 100) throw new Error("Catálogo de autos incompleto");
    return { items: sorted(items), photos, profiles, source: "forzadata", sourceUpdatedAt: dateValue(data.meta?.generated_at) };
  }
  function parseOrdinals(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Formato de autos alternativo desconocido");
    const items = Object.keys(data).filter(validCar);
    if (items.length < 100) throw new Error("Lista alternativa incompleta");
    return { items: sorted(items), photos: {}, source: "HDR Car Ordinals", sourceUpdatedAt: 0 };
  }
  function parseRecentCars(data) {
    if (!data?.fh6 || typeof data.fh6 !== "object" || Array.isArray(data.fh6)) throw new Error("Formato de autos recientes desconocido");
    const items = Object.values(data.fh6).filter(validCar);
    if (items.length < 100) throw new Error("Lista de autos recientes incompleta");
    return { items: sorted(items), photos: {}, source: "FH6 Livery Viewer", sourceUpdatedAt: dateValue(data._updated) };
  }
  function dateValue(value) {
    const parsed = typeof value === "string" ? Date.parse(value) : value;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  function validMap(map) {
    return Number.isFinite(map?.x) && Number.isFinite(map?.y)
      && map.x >= 0 && map.x <= 100 && map.y >= 0 && map.y <= 100;
  }
  function parseRaces(data) {
    if (!Array.isArray(data?.items)) throw new Error("Formato de carreras desconocido");
    const races = [];
    let updated = 0;
    for (const item of data.items) {
      const type = TYPES[item?.markerType];
      if (!type || !validName(item?.name)) continue;
      if (item.category !== "races" && !(item.category === "in_world_events" && ["time_attack", "drift_attack"].includes(item.markerType))) continue;
      const race = {
        name: item.name.trim(), type, sourceId: String(item.id ?? item.slug ?? raceKey(item.name)),
        sourceUrl: "https://forza.labsgg.com/interactive-map"
      };
      const map = item.metadata?.map_image;
      // Estos píxeles sólo son compatibles con la imagen de Japón incluida en la app.
      if (map?.width === 2160 && map.height === 2700 && map.coordinate_unit === "image_pixels"
        && Number.isFinite(item.mapPosition?.x) && Number.isFinite(item.mapPosition?.y)) {
        const position = { x: item.mapPosition?.x / 2160 * 100, y: item.mapPosition?.y / 2700 * 100 };
        if (validMap(position)) race.map = position;
      }
      if (!race.map) race.mapNote = "La fuente todavía no ofrece una ubicación compatible con este mapa.";
      races.push(race);
      updated = Math.max(updated, dateValue(item.updatedAt));
    }
    if (races.length < 20) throw new Error("Catálogo de carreras incompleto");
    return { items: races, source: "ForzaLabs", sourceUpdatedAt: updated };
  }
  function mergeRaces(existing, incoming) {
    const result = existing.map(race => ({ ...race }));
    const keys = new Map(result.map((race, index) => [raceKey(race.name), index]));
    const ids = new Map(result.flatMap((race, index) => race.sourceId ? [[race.sourceId, index]] : []));
    for (const race of incoming) {
      const index = ids.get(race.sourceId) ?? keys.get(raceKey(race.name));
      if (index === undefined) {
        keys.set(raceKey(race.name), result.length);
        if (race.sourceId) ids.set(race.sourceId, result.length);
        result.push({ ...race });
      } else {
        const previous = result[index];
        // Preservar nombres guardados/aliases, pero actualizar tipo y ubicación verificados.
        const merged = { ...previous, ...race, name: previous.name };
        if (race.map) delete merged.mapNote;
        else if (previous.map) { merged.map = previous.map; merged.mapNote = previous.mapNote; }
        result[index] = merged;
        keys.set(raceKey(race.name), index);
        if (race.sourceId) ids.set(race.sourceId, index);
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }
  function mergeCars(existing, incoming, photos) {
    const identity = name => photoIdentity(photos[normalize(name)]) || normalize(name);
    const result = new Map(existing.map(name => [identity(name), name]));
    for (const name of incoming) if (!result.has(identity(name))) result.set(identity(name), name);
    return sorted([...result.values()]);
  }
  function cleanPhotos(photos) {
    return Object.fromEntries(Object.entries(photos || {}).filter(([key, photo]) => /^[a-z0-9]+$/.test(key) && safePhoto(photo))
      .map(([key, photo]) => [key, { url: photo.url, sourceUrl: "https://github.com/pixelswiftali/forzadata", sourceName: "Forza Wiki / forzadata" }]));
  }
  function create(options) {
    const now = options.now || Date.now;
    const storage = options.storage;
    const bundledPhotos = cleanPhotos(options.photos);
    let photoOverrides = {};
    let profileOverrides = {};
    let inFlight = null;
    const blank = (items, source) => ({ items, source, checkedAt: 0, attemptedAt: 0, failed: false, sourceUpdatedAt: 0 });
    let state = {
      cars: blank(sorted((options.cars || []).filter(validCar)), "lista incluida"),
      races: blank((options.races || []).filter(r => validName(r?.name) && Object.values(TYPES).includes(r.type)), "lista incluida")
    };
    const cleanTime = time => Number.isFinite(time) && time > 0 && time <= now() + 60000 ? time : 0;
    try {
      const saved = JSON.parse(storage.getItem(CACHE_KEY) || "null");
      if (saved?.version === 1) {
        photoOverrides = cleanPhotos(saved.photos);
        profileOverrides = fit.cleanProfiles(saved.profiles);
        for (const kind of ["cars", "races"]) {
          const value = saved[kind];
          if (!Array.isArray(value?.items)) continue;
          const items = kind === "cars" ? value.items.filter(validCar)
            : value.items.filter(r => validName(r?.name) && Object.values(TYPES).includes(r.type)).map(r => ({
              name: r.name, type: r.type, ...(validMap(r.map) ? { map: r.map } : {}),
              sourceUrl: "https://forza.labsgg.com/interactive-map",
              ...(typeof r.sourceId === "string" ? { sourceId: r.sourceId } : {}),
              ...(validName(r.mapNote) ? { mapNote: r.mapNote } : {})
            }));
          if (items.length < (kind === "cars" ? 100 : 20)) continue;
          state[kind] = {
            items: kind === "cars" ? mergeCars(state.cars.items, items, { ...bundledPhotos, ...photoOverrides }) : mergeRaces(state.races.items, items),
            source: validName(value.source) ? value.source : "lista guardada",
            checkedAt: cleanTime(value.checkedAt), attemptedAt: cleanTime(value.attemptedAt),
            failed: value.failed === true, sourceUpdatedAt: cleanTime(value.sourceUpdatedAt)
          };
        }
      }
    } catch { /* Mantener los datos incluidos si la caché está dañada o bloqueada. */ }
    function nextAt(kind) {
      const entry = state[kind];
      return entry.failed ? entry.attemptedAt + RETRY_MS : entry.checkedAt ? entry.checkedAt + INTERVAL_MS : 0;
    }
    function snapshot() {
      return { ...state, photos: photoOverrides, profiles: profileOverrides, busy: !!inFlight, nextAt: Math.min(nextAt("cars"), nextAt("races")) };
    }
    function emit() { options.onChange?.(snapshot()); }
    function persist() {
      try { storage.setItem(CACHE_KEY, JSON.stringify({ version: 1, ...state, photos: photoOverrides, profiles: profileOverrides })); } catch { /* Usable en memoria. */ }
    }
    async function update(kind) {
      const attemptedAt = now();
      try {
        let feed;
        if (kind === "cars") {
          const results = await Promise.allSettled([
            options.fetchJson(SOURCES.cars).then(parseCars),
            options.fetchJson(SOURCES.recentCars).then(parseRecentCars)
          ]);
          const photoFeed = results[0].status === "fulfilled" ? results[0].value : null;
          const recentFeed = results[1].status === "fulfilled" ? results[1].value : null;
          if (photoFeed || recentFeed) {
            feed = {
              items: [...(photoFeed?.items || []), ...(recentFeed?.items || [])], photos: photoFeed?.photos || {},
              profiles: photoFeed?.profiles || {},
              source: [recentFeed?.source, photoFeed?.source].filter(Boolean).join(" + "),
              sourceUpdatedAt: Math.max(photoFeed?.sourceUpdatedAt || 0, recentFeed?.sourceUpdatedAt || 0)
            };
          } else feed = parseOrdinals(await options.fetchJson(SOURCES.fallbackCars));
          const known = { ...bundledPhotos, ...photoOverrides };
          for (const [key, photo] of Object.entries(feed.photos)) {
            if (photoIdentity(known[key]) !== photoIdentity(photo)) photoOverrides[key] = photo;
          }
          feed.items = mergeCars(state.cars.items, feed.items, { ...bundledPhotos, ...photoOverrides });
          for (const [key, profile] of Object.entries(feed.profiles || {})) {
            profileOverrides[key] = fit.combine(profileOverrides[key], profile);
          }
        } else {
          feed = parseRaces(await options.fetchJson(SOURCES.races));
          feed.items = mergeRaces(state.races.items, feed.items);
        }
        state[kind] = { items: feed.items, source: feed.source, sourceUpdatedAt: feed.sourceUpdatedAt, attemptedAt, checkedAt: now(), failed: false };
      } catch {
        state[kind] = { ...state[kind], attemptedAt, failed: true };
      }
      persist();
      emit();
    }
    function refresh({ force = false } = {}) {
      if (inFlight) return inFlight;
      if (options.isOnline?.() === false) { emit(); return Promise.resolve(snapshot()); }
      const due = ["cars", "races"].filter(kind => force || nextAt(kind) <= now());
      if (!due.length) { emit(); return Promise.resolve(snapshot()); }
      inFlight = Promise.resolve().then(() => Promise.all(due.map(update))).finally(() => { inFlight = null; emit(); });
      emit();
      return inFlight;
    }
    return { snapshot, refresh };
  }
  const api = { create, parseCars, parseOrdinals, parseRecentCars, parseRaces, mergeCars, mergeRaces, normalize, raceKey, CACHE_KEY, SOURCES, INTERVAL_MS, RETRY_MS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FH6CatalogSync = api;
})(typeof window !== "undefined" ? window : globalThis);
