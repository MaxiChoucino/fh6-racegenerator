const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fit = require('../car-suitability.js');
const sync = require('../catalog-sync.js');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../car-profiles.js'), 'utf8'), ctx);
const profiles = ctx.window.FH6_CAR_PROFILES;
const profile = name => profiles[fit.normalize(name)];

test('Aston Martin DB11: asfalto recomendado, campo traviesa desaconsejado', () => {
  const car = profile('2017 Aston Martin DB11');
  assert.equal(fit.assess(car, 'Road').level, 'good');
  assert.equal(fit.assess(car, 'Cross Country').level, 'poor');
  assert.equal(fit.assess(car, 'Dirt').level, 'setup');
});
test('Bronco Raptor e Impreza conservan su orientación todoterreno y rally', () => {
  const bronco = profile('2022 Ford Bronco Raptor');
  const subaru = profile('1998 Subaru Impreza 22B-STi Version');
  assert.equal(fit.assess(bronco, 'Cross Country').level, 'good');
  assert.equal(fit.assess(bronco, 'Road').level, 'poor');
  assert.equal(fit.assess(subaru, 'Dirt').level, 'good');
  assert.equal(fit.assess(subaru, 'Cross Country').level, 'poor');
});
test('drift no se confunde con carreras rápidas de circuito', () => {
  const car = profile('1989 Formula Drift 98 BMW 325i');
  assert.equal(fit.assess(car, 'Drift Attack').level, 'good');
  assert.equal(fit.assess(car, 'Time Attack').level, 'poor');
});
test('un clásico pequeño no recibe promesa de competitividad', () => {
  assert.equal(fit.assess(profile('1957 BMW Isetta 300 Export'), 'Road').level, 'setup');
});
test('sin categoría, modelo desconocido o carrera desconocida no inventa afinidad', () => {
  assert.equal(fit.assess(null, 'Road').level, 'unknown');
  assert.equal(fit.assess({ category: 'desconocido', stats: { speed: 10 } }, 'Drag').level, 'unknown');
  assert.equal(fit.assess(profile('2017 Aston Martin DB11'), 'Future Race').level, 'unknown');
});
test('datos nulos, booleanos, strings o fuera de escala no cuentan como atributos', () => {
  const p = fit.cleanProfile({ category: 'msp', stats: { handling: true, braking: '10', speed: 400, launch: null, acceleration: -1, offroad: 10 } });
  assert.deepEqual(p.stats, { offroad: 10 });
  assert.ok(!fit.recommendations(p).types.includes('Touge'));
  assert.ok(!fit.recommendations(p).types.includes('Drag'));
});
test('contrarreloj, touge y aceleración dependen de evidencia específica', () => {
  const stock = { category: 'msp', stats: { handling: 6, braking: 5, speed: 7, acceleration: 9, launch: 9 } };
  const result = fit.recommendations(stock);
  assert.ok(result.types.includes('Touge'));
  assert.ok(result.types.includes('Drag'));
  assert.ok(!result.types.includes('Time Attack'));
  assert.equal(fit.assess({ category: 'msp', stats: {} }, 'Drag').level, 'setup');
});
test('la categoría oficial prevalece y los atributos comunitarios la complementan', () => {
  const merged = fit.combine({ category: 'Cult Cars', source: 'official' }, { category: 'ram', stats: { speed: 4 } });
  assert.equal(merged.category, 'Cult Cars');
  assert.equal(merged.stats.speed, 4);
});
test('perfiles nuevos y estadísticas se sincronizan y sobreviven offline sin alterar garaje', async () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/cars.json')));
  data.cars.push({ year: 2027, title: 'Test Rally', fh6: { division: 'rra', stats: { offroad: 7, handling: 5 } } });
  const races = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/races.json')));
  const values = new Map();
  const options = {
    cars: data.cars.map(c => `${c.year} ${c.title}`), races: sync.parseRaces(races).items,
    storage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    fetchJson: async url => { if (url === sync.SOURCES.cars) return data; if (url === sync.SOURCES.races) return races; throw Error('offline'); }
  };
  const first = sync.create(options);
  await first.refresh();
  const key = fit.normalize('2027 Test Rally');
  assert.equal(fit.assess(first.snapshot().profiles[key], 'Dirt').level, 'good');
  const restored = sync.create(options);
  assert.equal(fit.assess(restored.snapshot().profiles[key], 'Dirt').level, 'good');
  const saved = restored.snapshot().profiles[key];
  options.fetchJson = async () => { throw Error('offline'); };
  const failed = sync.create(options);
  await failed.refresh({ force: true });
  assert.deepEqual(failed.snapshot().profiles[key], saved);
});
test('caché anterior sin perfiles sigue siendo compatible', () => {
  const profiles = fit.cleanProfiles({ bad: { category: '<script>' }, broken: null });
  assert.deepEqual(profiles, {});
  assert.deepEqual(fit.cleanProfiles(undefined), {});
});
