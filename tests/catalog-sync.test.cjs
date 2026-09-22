const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const work = path.resolve(__dirname, '..');
const sync = require(path.join(work, 'catalog-sync.js'));
const readJson = file => JSON.parse(fs.readFileSync(path.join(work, file), 'utf8').replace(/^\uFEFF/, ''));
const clone = value => JSON.parse(JSON.stringify(value));
const carsFeed = readJson('tests/fixtures/cars.json');
const racesFeed = readJson('tests/fixtures/races.json');
const bundledWindow = {};
for (const file of ['races.js', 'car-photos.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(work, file), 'utf8'), { window: bundledWindow });
}
const bundled = clone({ cars: bundledWindow.FH6_BUNDLED_CARS, races: bundledWindow.FH6_RACES, photos: bundledWindow.FH6_CAR_PHOTOS });
const newCar = { year: 2027, title: 'Fixture Motors Newcomer', image: { local_path: 'images/2027-fixture-motors-newcomer.png' } };
const newCarName = '2027 Fixture Motors Newcomer';
const newRace = {
  ...clone(racesFeed.items.find(item => item.category === 'races')),
  id: 'fixture-new-race', name: 'Fixture New Race', mapPosition: { x: 1080, y: 1350 }
};
const expandedCars = () => ({ ...clone(carsFeed), cars: [...clone(carsFeed.cars), clone(newCar)] });
const expandedRaces = () => ({ ...clone(racesFeed), items: [...clone(racesFeed.items), clone(newRace)] });
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}
function harness(overrides = {}) {
  let time = Date.UTC(2026, 8, 21, 15);
  let online = true;
  const storage = overrides.storage || memoryStorage();
  const calls = [];
  const changes = [];
  const feeds = new Map([[sync.SOURCES.cars, clone(carsFeed)], [sync.SOURCES.races, clone(racesFeed)]]);
  const options = {
    ...bundled, storage, now: () => time, isOnline: () => online,
    fetchJson: async url => {
      calls.push(url);
      const value = feeds.get(url);
      if (value instanceof Error) throw value;
      if (value === undefined) throw new Error('No mock feed: ' + url);
      return clone(value);
    },
    onChange: state => changes.push(state), ...overrides
  };
  const instance = sync.create(options);
  return { instance, storage, calls, changes, feeds, options, now: () => time,
    advance: ms => { time += ms; }, setOnline: value => { online = value; } };
}
function itemNames(items) { return items.map(item => typeof item === 'string' ? item : item.name); }

test('real community fixtures parse and retain compatible image coordinates', () => {
  const cars = sync.parseCars(carsFeed);
  const races = sync.parseRaces(racesFeed);
  assert.ok(cars.items.length >= 500);
  assert.ok(Object.keys(cars.photos).length >= 500);
  assert.ok(races.items.length >= 80);
  const source = racesFeed.items.find(item => item.category === 'races' && item.markerType === 'road_race');
  const parsed = races.items.find(item => item.sourceId === String(source.id));
  assert.equal(parsed.map.x, source.mapPosition.x / 2160 * 100);
  assert.equal(parsed.map.y, source.mapPosition.y / 2700 * 100);
  assert.ok(!races.items.some(item => item.type === undefined));
});

test('new car, exact photo URL and race are incorporated on refresh', async () => {
  const h = harness();
  h.feeds.set(sync.SOURCES.cars, expandedCars());
  h.feeds.set(sync.SOURCES.races, expandedRaces());
  await h.instance.refresh();
  const state = h.instance.snapshot();
  assert.ok(state.cars.items.includes(newCarName));
  assert.equal(state.photos[sync.normalize(newCarName)].url,
    'https://raw.githubusercontent.com/pixelswiftali/forzadata/main/images/2027-fixture-motors-newcomer.png');
  assert.deepEqual(state.races.items.find(item => item.name === newRace.name).map, { x: 50, y: 50 });
  assert.equal(state.cars.failed, false);
  assert.equal(state.races.failed, false);
});

test('malformed and incomplete feeds preserve each last good catalog and successful date', async () => {
  const h = harness();
  h.feeds.set(sync.SOURCES.cars, expandedCars());
  h.feeds.set(sync.SOURCES.races, expandedRaces());
  await h.instance.refresh();
  const before = clone(h.instance.snapshot());
  h.advance(10000);
  h.feeds.set(sync.SOURCES.cars, { cars: [] });
  h.feeds.set(sync.SOURCES.fallbackCars, { invalid: 1 });
  h.feeds.set(sync.SOURCES.races, { items: 'invalid' });
  await h.instance.refresh({ force: true });
  const after = h.instance.snapshot();
  for (const kind of ['cars', 'races']) {
    assert.deepEqual(after[kind].items, before[kind].items);
    assert.equal(after[kind].checkedAt, before[kind].checkedAt);
    assert.equal(after[kind].failed, true);
  }
  assert.deepEqual(after.photos, before.photos);
});

test('failed cars do not prevent adding a race', async () => {
  const h = harness();
  const previousCars = clone(h.instance.snapshot().cars.items);
  h.feeds.set(sync.SOURCES.cars, new Error('cars offline'));
  h.feeds.set(sync.SOURCES.races, expandedRaces());
  await h.instance.refresh();
  const state = h.instance.snapshot();
  assert.equal(state.cars.failed, true);
  assert.equal(state.races.failed, false);
  assert.ok(state.races.items.some(item => item.name === newRace.name));
  assert.deepEqual(state.cars.items, previousCars);
});

test('failed races do not prevent adding a car and its photo', async () => {
  const h = harness();
  h.feeds.set(sync.SOURCES.cars, expandedCars());
  h.feeds.set(sync.SOURCES.races, new Error('races offline'));
  await h.instance.refresh();
  const state = h.instance.snapshot();
  assert.equal(state.races.failed, true);
  assert.equal(state.cars.failed, false);
  assert.ok(state.cars.items.includes(newCarName));
  assert.ok(state.photos[sync.normalize(newCarName)]);
});

test('additive updates do not remove an existing car or race absent from the latest feed', async () => {
  const h = harness();
  h.feeds.set(sync.SOURCES.cars, expandedCars());
  h.feeds.set(sync.SOURCES.races, expandedRaces());
  await h.instance.refresh();
  const before = h.instance.snapshot();
  h.feeds.set(sync.SOURCES.cars, clone(carsFeed));
  h.feeds.set(sync.SOURCES.races, clone(racesFeed));
  await h.instance.refresh({ force: true });
  const after = h.instance.snapshot();
  for (const kind of ['cars', 'races']) {
    const names = new Set(itemNames(after[kind].items));
    for (const name of itemNames(before[kind].items)) assert.ok(names.has(name), `Removed ${kind}: ${name}`);
  }
});

test('race aliases Touge, Time Attack Track, and Alphine merge without duplicate selections', () => {
  const existing = [
    { name: 'Arashiyama Takao (Touge)', type: 'Touge' },
    { name: 'Hokubu Time Attack', type: 'Time Attack' },
    { name: 'Tateyama Alpine Cross Country', type: 'Cross Country' }
  ];
  const incoming = [
    { name: 'Arashiyama Takao', type: 'Touge', sourceId: 'touge' },
    { name: 'Hokubu Time Attack Track', type: 'Time Attack', sourceId: 'attack' },
    { name: 'Tateyama Alphine Cross Country', type: 'Cross Country', sourceId: 'alpine' }
  ];
  const merged = sync.mergeRaces(existing, incoming);
  assert.equal(merged.length, 3);
  assert.deepEqual(itemNames(merged).sort(), itemNames(existing).sort());
  assert.ok(merged.every(item => item.sourceId));
});

test('car aliases with the same exact photo preserve one existing selection', () => {
  const original = '2017 AM DB11';
  const preferred = '2017 Aston Martin DB11';
  const photo = { url: 'https://raw.githubusercontent.com/pixelswiftali/forzadata/main/images/2017-aston-martin-db11.png' };
  const merged = sync.mergeCars([original], [preferred], {
    [sync.normalize(original)]: photo, [sync.normalize(preferred)]: photo
  });
  assert.deepEqual(merged, [original]);
});

for (const [label, change] of [
  ['incompatible dimensions', item => { item.metadata.map_image.width = 5000; }],
  ['incompatible coordinate units', item => { item.metadata.map_image.coordinate_unit = 'world_meters'; }],
  ['negative coordinates', item => { item.mapPosition.x = -1; }],
  ['out-of-bounds coordinates', item => { item.mapPosition.y = 2701; }],
  ['missing coordinates', item => { delete item.mapPosition; }],
  ['null coordinates', item => { item.mapPosition = { x: null, y: null }; }],
  ['boolean coordinates', item => { item.mapPosition = { x: false, y: true }; }]
]) {
  test(`race with ${label} remains selectable without a false pin`, () => {
    const feed = expandedRaces();
    const item = feed.items.find(item => item.id === newRace.id);
    change(item);
    const race = sync.parseRaces(feed).items.find(item => item.sourceId === newRace.id);
    assert.ok(race);
    assert.equal(race.map, undefined);
    assert.ok(race.mapNote);
  });
}

test('an incompatible update preserves an already verified coordinate', () => {
  const previous = [{ name: 'Known Sprint', type: 'Road', sourceId: 'known', map: { x: 20, y: 40 } }];
  const next = [{ name: 'Known Sprint', type: 'Road', sourceId: 'known', mapNote: 'Incompatible dimensions' }];
  assert.deepEqual(sync.mergeRaces(previous, next)[0].map, { x: 20, y: 40 });
});

test('new photos and races survive recreation from persistent storage', async () => {
  const h = harness();
  h.feeds.set(sync.SOURCES.cars, expandedCars());
  h.feeds.set(sync.SOURCES.races, expandedRaces());
  await h.instance.refresh();
  const restored = sync.create(h.options).snapshot();
  assert.ok(restored.cars.items.includes(newCarName));
  assert.ok(restored.races.items.some(item => item.name === newRace.name));
  assert.equal(restored.photos[sync.normalize(newCarName)].url,
    h.instance.snapshot().photos[sync.normalize(newCarName)].url);
  assert.equal(restored.nextAt, h.now() + sync.INTERVAL_MS);
});

test('successful checks are due after six hours and manual refresh can run earlier', async () => {
  const h = harness();
  await h.instance.refresh();
  assert.equal(h.calls.length, 3);
  assert.equal(h.instance.snapshot().nextAt, h.now() + 6 * 60 * 60 * 1000);
  h.advance(sync.INTERVAL_MS - 1);
  await h.instance.refresh();
  assert.equal(h.calls.length, 3);
  h.advance(1);
  await h.instance.refresh();
  assert.equal(h.calls.length, 6);
  await h.instance.refresh({ force: true });
  assert.equal(h.calls.length, 9);
});

test('a failed source retries at fifteen minutes without refetching the successful source', async () => {
  const h = harness();
  h.feeds.set(sync.SOURCES.cars, new Error('offline'));
  await h.instance.refresh();
  assert.equal(h.calls.length, 4);
  assert.equal(h.instance.snapshot().nextAt, h.now() + 15 * 60 * 1000);
  h.advance(sync.RETRY_MS - 1);
  await h.instance.refresh();
  assert.equal(h.calls.length, 4);
  h.advance(1);
  h.feeds.set(sync.SOURCES.cars, expandedCars());
  await h.instance.refresh();
  assert.equal(h.calls.length, 6);
  assert.equal(h.calls.filter(url => url === sync.SOURCES.races).length, 1);
  assert.equal(h.instance.snapshot().cars.failed, false);
});

test('concurrent automatic and manual refreshes share one in-flight request per source', async () => {
  const pending = new Map();
  const calls = [];
  const h = harness({ fetchJson: url => {
    calls.push(url);
    return new Promise(resolve => pending.set(url, resolve));
  } });
  const first = h.instance.refresh();
  const second = h.instance.refresh({ force: true });
  assert.equal(first, second);
  assert.equal(h.instance.snapshot().busy, true);
  await Promise.resolve();
  assert.equal(calls.length, 3);
  pending.get(sync.SOURCES.cars)(clone(carsFeed));
  pending.get(sync.SOURCES.recentCars)({});
  pending.get(sync.SOURCES.races)(clone(racesFeed));
  await Promise.all([first, second]);
  assert.equal(h.instance.snapshot().busy, false);
  assert.equal(calls.length, 3);
});

test('recent-car feed supplements the photo catalog without inventing missing photos', async () => {
  const h = harness();
  const recent = {
    fh6: Object.fromEntries([...bundled.cars, '2028 Fixture Motors Recent Arrival'].map((name, index) => [index, name])),
    _updated: '2026-09-21T12:00:00Z'
  };
  h.feeds.set(sync.SOURCES.recentCars, recent);
  await h.instance.refresh();
  const state = h.instance.snapshot();
  assert.ok(state.cars.items.includes('2028 Fixture Motors Recent Arrival'));
  assert.equal(state.photos[sync.normalize('2028 Fixture Motors Recent Arrival')], undefined);
  assert.equal(state.cars.failed, false);
  assert.ok(!h.calls.includes(sync.SOURCES.fallbackCars));
});

test('recent-car feed alone can update cars when the photo catalog is unavailable', async () => {
  const h = harness();
  h.feeds.set(sync.SOURCES.cars, new Error('photo catalog offline'));
  h.feeds.set(sync.SOURCES.recentCars, {
    fh6: Object.fromEntries([...bundled.cars, '2028 Fixture Motors Recent Arrival'].map((name, index) => [index, name]))
  });
  await h.instance.refresh();
  assert.ok(h.instance.snapshot().cars.items.includes('2028 Fixture Motors Recent Arrival'));
  assert.equal(h.instance.snapshot().cars.failed, false);
  assert.ok(!h.calls.includes(sync.SOURCES.fallbackCars));
});

test('offline refresh preserves state without any network request', async () => {
  const h = harness();
  const before = h.instance.snapshot();
  h.setOnline(false);
  await h.instance.refresh({ force: true });
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.instance.snapshot(), before);
});

for (const [label, storage] of [
  ['invalid JSON', { getItem: () => '{bad', setItem() {} }],
  ['wrong saved schema', { getItem: () => JSON.stringify({ version: 1, cars: { items: 'bad' }, races: { items: [null] } }), setItem() {} }],
  ['denied storage', { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } }]
]) {
  test(`${label} does not prevent bundled use or an in-memory update`, async () => {
    const h = harness({ storage });
    assert.ok(h.instance.snapshot().cars.items.length >= 500);
    assert.ok(h.instance.snapshot().races.items.length >= 80);
    h.feeds.set(sync.SOURCES.cars, expandedCars());
    await h.instance.refresh();
    assert.ok(h.instance.snapshot().cars.items.includes(newCarName));
    assert.equal(h.instance.snapshot().busy, false);
  });
}
