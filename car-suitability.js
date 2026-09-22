/* Orientación heurística del auto de serie; no es una clasificación oficial de rendimiento. */
(function (root) {
  "use strict";
  const normalize = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const CATEGORIES = {
    sgt: ["Super GT", "road"], gtc: ["GT Cars", "road"], h: ["Hypercars", "road"],
    msu: ["Modern Supercars", "road"], rsu: ["Retro Supercars", "road"],
    msp: ["Modern Sports Cars", "compact"], rsp: ["Retro Sports Cars", "compact"],
    mss: ["Modern Super Saloons", "road"], rss: ["Retro Super Saloons", "road"],
    hh: ["Hot Hatch", "compact"], rhh: ["Retro Hot Hatch", "compact"], shh: ["Super Hot Hatch", "compact"],
    tt: ["Track Toys", "track"], ett: ["Extreme Track Toys", "track"], rrc: ["Retro Racers", "track"], crc: ["Classic Racers", "track"],
    crl: ["Classic Rally", "rally"], cra: ["Classic Rally", "rally"], rra: ["Retro Rally", "rally"],
    mr: ["Modern Rally", "rally"], ram: ["Rally Monsters", "rally"],
    o: ["Offroad", "offroad"], uo: ["Unlimited Offroad", "offroad"], ub: ["Unlimited Buggies", "offroad"],
    b: ["Buggies", "offroad"], utv: ["UTV's", "offroad"], p4: ["Pickups & 4x4's", "offroad"],
    dc: ["Drift Cars", "drift"], suh: ["Sports Utility Heroes", "suv"],
    mm: ["Modern Muscle", "road"], rem: ["Retro Muscle", "road"], cm: ["Classic Muscle", "road"],
    rc: ["Rare Classics", "classic"], csc: ["Classic Sports Cars", "classic"],
    cc: ["Cult Cars", "classic"], rac: ["Rods and Customs", "classic"],
    uh: ["Utility Heroes", "classic"], ecd: ["Eclectic Domestics", "classic"]
  };
  const aliases = new Map();
  for (const [code, [category, group]] of Object.entries(CATEGORIES)) {
    aliases.set(normalize(code), { category, group });
    aliases.set(normalize(category), { category, group });
  }
  aliases.set("classiccustoms", aliases.get("cc"));
  aliases.set("rodsandcustoms", aliases.get("rac"));
  aliases.set("rodscustoms", aliases.get("rac"));
  aliases.set("electicdomestics", aliases.get("ecd"));
  const LABELS = {
    Road: "Asfalto", Street: "Callejera", Dirt: "Tierra", "Cross Country": "Campo traviesa",
    Touge: "Touge", Drag: "Aceleración", "Time Attack": "Contrarreloj", "Drift Attack": "Drift Attack"
  };
  const GROUP_LABELS = {
    road: "Deportivo de asfalto", compact: "Deportivo / compacto", track: "Orientado a circuito",
    rally: "Rally", offroad: "Todoterreno", drift: "Drift", suv: "SUV deportivo", classic: "Clásico / uso general"
  };
  function cleanProfile(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const match = typeof value.category === "string" ? aliases.get(normalize(value.category)) : null;
    const stats = {};
    for (const key of ["speed", "handling", "acceleration", "launch", "braking", "offroad"]) {
      const score = value.stats?.[key];
      if (Number.isFinite(score) && score >= 0 && score <= 10) stats[key] = score;
    }
    if (!match && !Object.keys(stats).length) return null;
    return { category: match?.category || "", stats, source: value.source === "official" ? "official" : "community" };
  }
  function extractProfile(car) {
    return cleanProfile({ category: car?.fh6?.division, stats: car?.fh6?.stats });
  }
  function cleanProfiles(values) {
    const result = {};
    if (!values || typeof values !== "object" || Array.isArray(values)) return result;
    for (const [key, value] of Object.entries(values)) {
      if (!/^[a-z0-9]+$/.test(key)) continue;
      const profile = cleanProfile(value);
      if (profile) result[key] = profile;
    }
    return result;
  }
  function combine(base, update) {
    base = cleanProfile(base);
    update = cleanProfile(update);
    if (!base) return update;
    if (!update) return base;
    const category = base.source === "official" && base.category ? base.category : update.category || base.category;
    return { category, stats: { ...base.stats, ...update.stats }, source: base.source === "official" ? "official" : update.source };
  }
  function recommendations(profile) {
    profile = cleanProfile(profile);
    const match = profile && aliases.get(normalize(profile.category));
    if (!match) return { group: null, label: "Sin categoría disponible", types: [] };
    const { group } = match;
    const stats = profile.stats;
    let types;
    if (group === "drift") types = ["Drift Attack"];
    else if (group === "offroad") types = ["Cross Country", "Dirt"];
    else if (group === "rally") types = ["Dirt"];
    else if (group === "track") types = ["Road", "Time Attack", "Street"];
    else types = ["Road", "Street"];
    if (["compact", "track"].includes(group) && stats.handling >= 5.5 && stats.braking >= 4.5) types.push("Touge");
    if (["road", "compact"].includes(group) && stats.handling >= 7 && stats.braking >= 6) types.push("Time Attack");
    if (["road", "compact", "track"].includes(group) && stats.launch >= 8 && stats.acceleration >= 8 && stats.speed >= 7) types.push("Drag");
    return { group, label: GROUP_LABELS[group], types: [...new Set(types)] };
  }
  function assess(profile, raceType) {
    const recommended = recommendations(profile);
    if (!recommended.group || !LABELS[raceType]) return {
      ...recommended, level: "unknown", title: "Sin datos suficientes",
      reason: "Todavía no podemos valorar este auto para la carrera seleccionada."
    };
    const { group, types } = recommended;
    const result = (level, title, reason) => ({ ...recommended, level, title, reason });
    if (types.includes(raceType)) {
      if (group === "classic") return result("setup", "Puede servir con preparación", "Su orientación es de asfalto, pero revisá potencia, frenos y clase antes de competir.");
      const reasons = {
        Dirt: group === "rally" ? "Su categoría de rally encaja con carreras sobre tierra." : "Su categoría todoterreno es un buen punto de partida para tierra.",
        "Cross Country": "Su categoría todoterreno encaja con recorridos fuera del asfalto.",
        "Drift Attack": "Es un auto de drift: está orientado a derrapar y sumar puntos.",
        "Time Attack": "Su orientación a circuito o sus atributos de manejo y frenado favorecen las vueltas rápidas.",
        Touge: "Su categoría y sus atributos de manejo y frenado favorecen los tramos de curvas.",
        Drag: "Sus atributos de salida, aceleración y velocidad ofrecen un buen punto de partida; revisá el desarrollo.",
        Road: "Su categoría encaja con carreras sobre asfalto.", Street: "Su categoría encaja con carreras callejeras sobre asfalto."
      };
      return result("good", "Buena afinidad", reasons[raceType]);
    }
    if (group === "drift") return result("poor", "Poco adecuado de serie", "Su preparación para derrapar no prioriza el agarre ni los tiempos de carrera.");
    if (raceType === "Cross Country") return result("poor", "Poco adecuado de serie", "Los saltos y el terreno irregular favorecen autos todoterreno con suspensión apropiada.");
    if (raceType === "Dirt") return result("setup", "Conviene prepararlo", "Revisá neumáticos y suspensión para tierra; no es su orientación principal.");
    if (raceType === "Drift Attack") return result("setup", "Requiere preparación para drift", "La tracción, el diferencial y la suspensión deben favorecer los derrapes.");
    if (raceType === "Drag") return result("setup", "Revisá la preparación de aceleración", "La salida, la tracción y las relaciones de marcha importan; la categoría por sí sola no alcanza.");
    if (group === "offroad") return result("poor", "Poco adecuado de serie", "Está orientado al terreno irregular; el agarre y la precisión en asfalto pueden quedar atrás.");
    return result("setup", "Puede servir con ajustes", "Revisá agarre, frenado y puesta a punto para este tipo de carrera.");
  }
  const api = { normalize, cleanProfile, cleanProfiles, extractProfile, combine, recommendations, assess, LABELS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FH6Suitability = api;
})(typeof window !== "undefined" ? window : globalThis);
