// Builds the cover map data in assets/maps/ from OpenFreeMap's OpenMapTiles
// vector tiles, the same data SVGmap draws from. Requires Node 22 or later and
// no packages. Downloaded tiles are kept in the system temp folder.
//
//   node tools/build-maps.mjs              all cities
//   node tools/build-maps.mjs paris boston some of them

import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// mpp is meters per CSS pixel at the starting zoom. The banner is 978 x 298
// on a desktop, and the data covers REGION pixels around the center.
const CITIES = [
  { id: 'cincinnati', name: 'Cincinnati', about: 'Cincinnati and the Ohio River', lat: 39.0977, lon: -84.5124, mpp: 9 },
  { id: 'chicago', name: 'Chicago', about: 'The Chicago Loop and Lake Michigan', lat: 41.8835, lon: -87.6265, mpp: 7.5 },
  { id: 'manhattan', name: 'Lower Manhattan', about: 'Lower Manhattan and the Brooklyn waterfront', lat: 40.7075, lon: -74.0010, mpp: 6.5 },
  { id: 'boston', name: 'Boston', about: 'Boston, Cambridge, and the Charles River', lat: 42.3555, lon: -71.0730, mpp: 7 },
  { id: 'washington', name: 'Washington, D.C.', about: 'The National Mall and the Potomac River', lat: 38.8895, lon: -77.0300, mpp: 7.25 },
  { id: 'paris', name: 'Paris', about: 'Paris and the Seine', lat: 48.8560, lon: 2.3420, mpp: 5 },
  { id: 'san-francisco', name: 'San Francisco', about: 'San Francisco and the Bay', lat: 37.8000, lon: -122.4060, mpp: 8 },
  { id: 'venice', name: 'Venice', about: 'Venice and the Grand Canal', lat: 45.4375, lon: 12.3330, mpp: 3.6 },
  { id: 'seattle', name: 'Seattle', about: 'Downtown Seattle and Elliott Bay', lat: 47.6050, lon: -122.3385, mpp: 5.5 },
  { id: 'vancouver', name: 'Vancouver', about: 'Downtown Vancouver, False Creek, and Stanley Park', lat: 49.2860, lon: -123.1240, mpp: 7 },
  { id: 'rio', name: 'Rio de Janeiro', about: 'Botafogo, Urca, and Sugarloaf Mountain', lat: -22.9490, lon: -43.1660, mpp: 6 },
  { id: 'london', name: 'London', about: 'Westminster, the City of London, and the Thames', lat: 51.5060, lon: -0.1000, mpp: 5.2 },
  { id: 'amsterdam', name: 'Amsterdam', about: 'The Amsterdam canal ring', lat: 52.3700, lon: 4.8900, mpp: 4.5 },
  { id: 'naarden', name: 'Naarden', about: 'The fortified town of Naarden', lat: 52.2955, lon: 5.1625, mpp: 4.8 },
  { id: 'barcelona', name: 'Barcelona', about: 'The Eixample and the old town of Barcelona', lat: 41.3890, lon: 2.1680, mpp: 4 },
  { id: 'monaco', name: 'Monaco', about: 'Monaco and Port Hercule', lat: 43.7348, lon: 7.4232, mpp: 3.5 },
  { id: 'istanbul', name: 'Istanbul', about: 'The old city of Istanbul and the Golden Horn', lat: 41.0150, lon: 28.9780, mpp: 5 },
  { id: 'dubai', name: 'Dubai Marina', about: 'Dubai Marina and Jumeirah Beach', lat: 25.0800, lon: 55.1400, mpp: 4 },
  { id: 'tokyo', name: 'Tokyo', about: 'Marunouchi, Ginza, and the Imperial Palace', lat: 35.6800, lon: 139.7620, mpp: 5 },
  { id: 'hong-kong', name: 'Hong Kong', about: 'Central, Wan Chai, and Victoria Harbour', lat: 22.2815, lon: 114.1640, mpp: 4.5 },
  { id: 'singapore', name: 'Singapore', about: 'Marina Bay and the Singapore River', lat: 1.2850, lon: 103.8560, mpp: 4.5 },
  { id: 'sydney', name: 'Sydney', about: 'Sydney Harbour and the Opera House', lat: -33.8600, lon: 151.2110, mpp: 5.5 },
  { id: 'melbourne', name: 'Melbourne', about: 'The Melbourne CBD, the Yarra River, and the MCG', lat: -37.8180, lon: 144.9680, mpp: 5 },
  { id: 'auckland', name: 'Auckland', about: 'Auckland and the Waitematā Harbour', lat: -36.8445, lon: 174.7580, mpp: 6.5 },
];

const REGION = [1300, 400];
const ZOOM = 14;
const EXTENT = 4096;
// Fills are cut a little past each tile's edge so the pieces overlap.
const MARGIN = 2;
// Footpaths with more than this share of their length this close to a street
// are taken for sidewalks and crossings, which the tiles don't mark as such.
const SIDEWALK_SHARE = 0.6;
const SIDEWALK_M = 14;
// Buildings smaller than this, in square meters, are mostly sheds.
const MIN_BUILDING = 25;

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'assets', 'maps');
const cacheDir = join(tmpdir(), 'portfolio-map-tiles');

/* Protocol buffers, just enough for vector tiles */

class Reader {
  constructor(bytes, start = 0, end = bytes.length) {
    this.bytes = bytes;
    this.pos = start;
    this.end = end;
  }

  varint() {
    let value = 0;
    let shift = 0;
    let byte;
    do {
      byte = this.bytes[this.pos++];
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return value;
  }

  field() {
    const key = this.varint();
    return { tag: Math.floor(key / 8), type: key & 7 };
  }

  sub() {
    const length = this.varint();
    const reader = new Reader(this.bytes, this.pos, this.pos + length);
    this.pos += length;
    return reader;
  }

  string() {
    const length = this.varint();
    const text = Buffer.from(this.bytes.buffer, this.bytes.byteOffset + this.pos, length).toString('utf8');
    this.pos += length;
    return text;
  }

  packed() {
    const reader = this.sub();
    const out = [];
    while (reader.pos < reader.end) out.push(reader.varint());
    return out;
  }

  skip(type) {
    if (type === 0) this.varint();
    else if (type === 1) this.pos += 8;
    else if (type === 2) this.pos += this.varint();
    else if (type === 5) this.pos += 4;
    else throw new Error('Unknown wire type ' + type);
  }
}

function readValue(reader) {
  let value = null;
  while (reader.pos < reader.end) {
    const { tag, type } = reader.field();
    if (tag === 1) value = reader.string();
    else if (tag === 2) {
      value = new DataView(reader.bytes.buffer, reader.bytes.byteOffset + reader.pos, 4).getFloat32(0, true);
      reader.pos += 4;
    } else if (tag === 3) {
      value = new DataView(reader.bytes.buffer, reader.bytes.byteOffset + reader.pos, 8).getFloat64(0, true);
      reader.pos += 8;
    } else if (tag === 4 || tag === 5) value = reader.varint();
    else if (tag === 6) {
      const n = reader.varint();
      value = n % 2 ? -(n + 1) / 2 : n / 2;
    } else if (tag === 7) value = reader.varint() === 1;
    else reader.skip(type);
  }
  return value;
}

function readLayer(reader) {
  const layer = { name: '', extent: 4096, keys: [], values: [], features: [] };
  const raw = [];
  while (reader.pos < reader.end) {
    const { tag, type } = reader.field();
    if (tag === 1) layer.name = reader.string();
    else if (tag === 2) raw.push(reader.sub());
    else if (tag === 3) layer.keys.push(reader.string());
    else if (tag === 4) layer.values.push(readValue(reader.sub()));
    else if (tag === 5) layer.extent = reader.varint();
    else reader.skip(type);
  }
  for (const f of raw) {
    const feature = { type: 0, tags: [], geometry: [] };
    while (f.pos < f.end) {
      const { tag, type } = f.field();
      if (tag === 2) feature.tags = f.packed();
      else if (tag === 3) feature.type = f.varint();
      else if (tag === 4) feature.geometry = f.packed();
      else f.skip(type);
    }
    const props = {};
    for (let i = 0; i < feature.tags.length; i += 2) props[layer.keys[feature.tags[i]]] = layer.values[feature.tags[i + 1]];
    layer.features.push({ type: feature.type, props, rings: decodeGeometry(feature.geometry) });
  }
  return layer;
}

function readTile(bytes) {
  const reader = new Reader(bytes);
  const layers = {};
  while (reader.pos < reader.end) {
    const { tag, type } = reader.field();
    if (tag === 3) {
      const layer = readLayer(reader.sub());
      layers[layer.name] = layer;
    } else reader.skip(type);
  }
  return layers;
}

// Each part as a flat [x0, y0, x1, y1, ...] array.
function decodeGeometry(geometry) {
  const parts = [];
  let part = null;
  let x = 0;
  let y = 0;
  for (let i = 0; i < geometry.length; ) {
    const command = geometry[i] & 7;
    const count = geometry[i] >> 3;
    i++;
    if (command === 1 || command === 2) {
      for (let k = 0; k < count; k++) {
        const dx = geometry[i++];
        const dy = geometry[i++];
        x += dx % 2 ? -(dx + 1) / 2 : dx / 2;
        y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
        if (command === 1) {
          part = [x, y];
          parts.push(part);
        } else part.push(x, y);
      }
    }
  }
  return parts;
}

/* Downloads */

async function tileTemplate() {
  const response = await fetch('https://tiles.openfreemap.org/planet');
  if (!response.ok) throw new Error('TileJSON request failed with ' + response.status);
  const json = await response.json();
  return json.tiles[0];
}

async function getTile(template, x, y) {
  const version = template.split('/').slice(-4, -3)[0];
  const file = join(cacheDir, version, `${ZOOM}-${x}-${y}.pbf`);
  try {
    return await readFile(file);
  } catch {
    // Not cached yet.
  }
  const url = template.replace('{z}', ZOOM).replace('{x}', x).replace('{y}', y);
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url);
    if (response.status === 204 || response.status === 404) return Buffer.alloc(0);
    if (response.ok) {
      let bytes = Buffer.from(await response.arrayBuffer());
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, bytes);
      return bytes;
    }
    if (attempt === 3) throw new Error(`Tile ${x}/${y} failed with ${response.status}`);
  }
}

async function getTiles(template, list) {
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      out[i] = await getTile(template, list[i][0], list[i][1]);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

/* Classes, after SVGmap's tiles/schema.ts */

const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary']);
const STREETS = new Set(['tertiary', 'minor', 'busway', 'bus_guideway', 'raceway']);
const SERVICE = new Set(['service', 'track']);

function lineLayer(layer, p) {
  if (p.brunnel === 'tunnel') return null;
  if (layer === 'waterway') return ['river', 'canal', 'stream'].includes(p.class) ? 'waterways' : null;
  if (layer !== 'transportation') return null;
  if (p.indoor === 1 || p.indoor === true || String(p.class).endsWith('_construction')) return null;
  if (MAJOR.has(p.class)) return 'major';
  if (STREETS.has(p.class)) return 'streets';
  if (SERVICE.has(p.class)) return p.service === 'parking_aisle' || p.service === 'driveway' ? null : 'service';
  if (p.class === 'path') {
    if (p.subclass === 'pedestrian') return 'streets';
    if (['footway', 'path', 'cycleway', 'steps', 'bridleway', undefined, ''].includes(p.subclass)) return 'paths';
    return null;
  }
  if ((p.class === 'rail' || p.class === 'transit') && p.subclass && p.subclass !== 'subway') return 'rail';
  return null;
}

function fillLayer(layer, p) {
  if (layer === 'building') return 'buildings';
  if (layer === 'water') return p.brunnel === 'tunnel' || p.class === 'swimming_pool' ? null : 'water';
  if (layer === 'landcover') return ['wood', 'grass', 'wetland'].includes(p.class) ? 'greens' : null;
  if (layer === 'landuse') return ['pitch', 'track', 'cemetery', 'playground'].includes(p.class) ? 'greens' : null;
  return null;
}

// Whole meters. Outlines of buildings that are also mapped as parts are
// marked, so the 3D view draws the parts alone.
function buildingHeight(p) {
  const top = Math.max(0, Math.min(1000, Math.round(p.render_height || 0)));
  const bottom = Math.max(0, Math.min(top, Math.round(p.render_min_height || 0)));
  return { top, bottom, hide: !!p.hide_3d };
}

/* Geometry */

function ringArea(r) {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += r[i] * r[j + 1] - r[j] * r[i + 1];
  }
  return a / 2;
}

// Sutherland-Hodgman, one side of the box at a time.
function clipRing(ring, x0, y0, x1, y1) {
  let pts = [];
  for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
  for (const [axis, value, low] of [[0, x0, true], [0, x1, false], [1, y0, true], [1, y1, false]]) {
    const inside = (p) => (low ? p[axis] >= value : p[axis] <= value);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(b)) out.push(cut(a, b, axis, value));
    }
    pts = out;
    if (pts.length < 3) return null;
  }
  return pts.flat();
}

function cut(a, b, axis, value) {
  const t = (value - a[axis]) / (b[axis] - a[axis]);
  const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  p[axis] = value;
  return p;
}

// Liang-Barsky on each segment, returning the pieces inside the box.
function clipLine(line, x0, y0, x1, y1) {
  const pieces = [];
  let current = null;
  for (let i = 0; i + 3 < line.length; i += 2) {
    const ax = line[i], ay = line[i + 1], bx = line[i + 2], by = line[i + 3];
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1;
    let ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) {
        if (q < 0) ok = false;
      } else {
        const r = q / p;
        if (p < 0) t0 = Math.max(t0, r);
        else t1 = Math.min(t1, r);
      }
    }
    if (!ok || t0 > t1) {
      current = null;
      continue;
    }
    const sx = ax + dx * t0, sy = ay + dy * t0, ex = ax + dx * t1, ey = ay + dy * t1;
    if (!current || t0 > 0) {
      current = [sx, sy];
      pieces.push(current);
    }
    current.push(ex, ey);
    if (t1 < 1) current = null;
  }
  return pieces.filter((p) => p.length >= 4);
}

function roundPart(part, step) {
  const out = [];
  for (let i = 0; i < part.length; i += 2) {
    const x = Math.round(part[i] / step) * step;
    const y = Math.round(part[i + 1] / step) * step;
    if (out.length && out[out.length - 2] === x && out[out.length - 1] === y) continue;
    out.push(x, y);
  }
  return out;
}

// Douglas-Peucker. Pinned points stay, so the edges along a cut stay on it
// and the page can tell them from the real outline.
function simplify(points, tolerance, closed, pinned) {
  const n = points.length / 2;
  if (n <= (closed ? 4 : 2)) return points;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [];
  let last = 0;
  for (let i = 1; i < n; i++) {
    if (i < n - 1 && !pinned(points[2 * i], points[2 * i + 1])) continue;
    keep[i] = 1;
    stack.push([last, i]);
    last = i;
  }
  const t2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = points[2 * a], ay = points[2 * a + 1], bx = points[2 * b], by = points[2 * b + 1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1, bestD = t2;
    for (let i = a + 1; i < b; i++) {
      const px = points[2 * i] - ax, py = points[2 * i + 1] - ay;
      let d;
      if (len2 === 0) d = px * px + py * py;
      else {
        const cross = px * dy - py * dx;
        d = (cross * cross) / len2;
      }
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[2 * i], points[2 * i + 1]);
  return closed && out.length < 6 ? points : out;
}

// Whether a point is in any of the polygons, by winding number.
function areaTest(polygons) {
  const rings = [];
  for (const polygon of polygons) {
    for (const points of polygon) {
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < points.length; i += 2) {
        box[0] = Math.min(box[0], points[i]);
        box[1] = Math.min(box[1], points[i + 1]);
        box[2] = Math.max(box[2], points[i]);
        box[3] = Math.max(box[3], points[i + 1]);
      }
      rings.push({ points, box });
    }
  }
  return (x, y) => {
    let winding = 0;
    for (const { points: p, box } of rings) {
      if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
      for (let i = 0, n = p.length; i < n; i += 2) {
        const ax = p[i], ay = p[i + 1], bx = p[(i + 2) % n], by = p[(i + 3) % n];
        const side = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
        if (ay <= y && by > y && side > 0) winding++;
        else if (ay > y && by <= y && side < 0) winding--;
      }
    }
    return winding !== 0;
  };
}

// Rivers mapped as areas also have a center line, which shows in outlines.
function dropCenterLines(waterways, inWater) {
  return waterways.filter((line) => {
    let inside = 0;
    let total = 0;
    for (let i = 2; i < line.length; i += 2) {
      total++;
      if (inWater((line[i - 2] + line[i]) / 2, (line[i - 1] + line[i + 1]) / 2)) inside++;
    }
    return inside / total < 0.5;
  });
}

// The edges of the water with land on the other side, for the plotter. A
// river and the bay it runs into are separate areas, and the line between
// them, like the edges cut along the tiles, would show across the water.
function shoreLines(polygons, inWater, cutEdge) {
  const out = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const n = ring.length / 2;
      const shore = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = ring[2 * i], ay = ring[2 * i + 1], bx = ring[2 * j], by = ring[2 * j + 1];
        const length = Math.hypot(bx - ax, by - ay);
        if (!length || cutEdge(ax, ay, bx, by)) continue;
        // Water is on the left of each edge, so this point is just outside.
        shore[i] = inWater((ax + bx) / 2 + ((by - ay) / length) * 1.5, (ay + by) / 2 - ((bx - ax) / length) * 1.5) ? 0 : 1;
      }
      const start = shore.indexOf(0);
      let current = null;
      for (let k = 0; k < n; k++) {
        const i = (Math.max(start, 0) + k) % n;
        const j = (i + 1) % n;
        if (shore[i]) {
          if (!current) current = [ring[2 * i], ring[2 * i + 1]];
          current.push(ring[2 * j], ring[2 * j + 1]);
        } else if (current) {
          out.push(current);
          current = null;
        }
      }
      if (current) out.push(current);
    }
  }
  return out;
}

function lineLength(line) {
  let length = 0;
  for (let i = 2; i < line.length; i += 2) length += Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]);
  return length;
}

// Joins line pieces that were split at a tile edge.
function joinLines(lines) {
  const key = (x, y) => Math.round(x) + ',' + Math.round(y);
  const onEdge = (x, y) => Math.abs(x - Math.round(x / EXTENT) * EXTENT) < 1.5 || Math.abs(y - Math.round(y / EXTENT) * EXTENT) < 1.5;
  const starts = new Map();
  lines.forEach((line, i) => {
    if (!onEdge(line[0], line[1])) return;
    const k = key(line[0], line[1]);
    if (!starts.has(k)) starts.set(k, []);
    starts.get(k).push(i);
  });
  const used = new Uint8Array(lines.length);
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    let line = lines[i];
    for (;;) {
      const n = line.length;
      const ex = line[n - 2], ey = line[n - 1];
      if (!onEdge(ex, ey)) break;
      let found = -1;
      for (let dx = -1; dx <= 1 && found < 0; dx++) {
        for (let dy = -1; dy <= 1 && found < 0; dy++) {
          const list = starts.get(key(ex + dx, ey + dy));
          if (list) found = list.find((j) => !used[j] && lines[j].cls === lines[i].cls) ?? -1;
        }
      }
      if (found < 0) break;
      used[found] = 1;
      line = line.concat(lines[found].slice(2));
    }
    line.cls = lines[i].cls;
    merged.push(line);
  }
  return merged;
}

function hilbert(x, y) {
  let d = 0;
  for (let s = 1 << 15; s > 0; s >>= 1) {
    const rx = (x & s) > 0 ? 1 : 0;
    const ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        x = 65535 - x;
        y = 65535 - y;
      }
      [x, y] = [y, x];
    }
  }
  return d;
}

/* Sidewalks */

function dropSidewalks(paths, streets, unitM) {
  const reach = SIDEWALK_M / unitM;
  const cell = reach * 2;
  const grid = new Map();
  for (const line of streets) {
    for (let i = 2; i < line.length; i += 2) {
      const ax = line[i - 2], ay = line[i - 1], bx = line[i], by = line[i + 1];
      const cx0 = Math.floor((Math.min(ax, bx) - reach) / cell), cx1 = Math.floor((Math.max(ax, bx) + reach) / cell);
      const cy0 = Math.floor((Math.min(ay, by) - reach) / cell), cy1 = Math.floor((Math.max(ay, by) + reach) / cell);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const k = cx + ',' + cy;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push([ax, ay, bx, by]);
        }
      }
    }
  }
  const near = (x, y) => {
    const list = grid.get(Math.floor(x / cell) + ',' + Math.floor(y / cell));
    if (!list) return false;
    for (const [ax, ay, bx, by] of list) {
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      if (Math.hypot(ax + dx * t - x, ay + dy * t - y) < reach) return true;
    }
    return false;
  };
  const step = 4 / unitM;
  return paths.filter((line) => {
    let total = 0;
    let close = 0;
    for (let i = 2; i < line.length; i += 2) {
      const ax = line[i - 2], ay = line[i - 1], bx = line[i], by = line[i + 1];
      const length = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.round(length / step));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        total += length / n;
        if (near(ax + (bx - ax) * t, ay + (by - ay) * t)) close += length / n;
      }
    }
    return total > 0 && close / total < SIDEWALK_SHARE;
  });
}

/* Encoding: zigzag varints, 5 bits to a base64 character */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function encoder() {
  let text = '';
  let lx = 0;
  let ly = 0;
  const put = (n) => {
    while (n >= 32) {
      text += ALPHABET[(n & 31) | 32];
      n = Math.floor(n / 32);
    }
    text += ALPHABET[n];
  };
  const signed = (n) => put(n < 0 ? -2 * n - 1 : 2 * n);
  return {
    count: put,
    points(part) {
      put(part.length / 2);
      for (let i = 0; i < part.length; i += 2) {
        signed(part[i] - lx);
        signed(part[i + 1] - ly);
        lx = part[i];
        ly = part[i + 1];
      }
    },
    get text() {
      return text;
    },
  };
}

/* Build */

async function build(city, template) {
  const unitM = (40075016.686 * Math.cos((city.lat * Math.PI) / 180)) / 2 ** ZOOM / EXTENT;
  const world = 2 ** ZOOM * EXTENT;
  const cx = ((city.lon + 180) / 360) * world;
  const lat = (city.lat * Math.PI) / 180;
  const cy = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * world;
  const halfW = (REGION[0] / 2) * city.mpp / unitM;
  const halfH = (REGION[1] / 2) * city.mpp / unitM;
  const tx0 = Math.floor((cx - halfW) / EXTENT), tx1 = Math.floor((cx + halfW) / EXTENT);
  const ty0 = Math.floor((cy - halfH) / EXTENT), ty1 = Math.floor((cy + halfH) / EXTENT);
  const ox = tx0 * EXTENT, oy = ty0 * EXTENT;
  // Points are rounded to whole units, or to two where that is still at most
  // two thirds of a pixel at the deepest zoom (4x). Either way the tile edges
  // stay on multiples of EXTENT, MARGIN to each side of them.
  const step = city.mpp / 4 / unitM >= 3 ? 2 : 1;
  const snap = (v) => Math.round(v / step) * step;
  const bounds = [snap(cx - halfW - ox), snap(cy - halfH - oy), snap(cx + halfW - ox), snap(cy + halfH - oy)];
  const onCut = (v, axis) => v === bounds[axis] || v === bounds[axis + 2] || (v % EXTENT) === 0 || ((v + MARGIN) % EXTENT) === 0 || ((v - MARGIN) % EXTENT) === 0;
  const pinned = (x, y) => onCut(x, 0) || onCut(y, 1);

  const list = [];
  for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) list.push([x, y]);
  const tiles = await getTiles(template, list);

  const fills = { water: [], greens: [], buildings: [] };
  const lines = { waterways: [], rail: [], paths: [], service: [], streets: [], major: [] };
  const minBuilding = MIN_BUILDING / (unitM * unitM);

  tiles.forEach((bytes, i) => {
    if (!bytes.length) return;
    const [tx, ty] = list[i];
    const dx = (tx - tx0) * EXTENT, dy = (ty - ty0) * EXTENT;
    const box = [Math.max(dx, bounds[0]), Math.max(dy, bounds[1]), Math.min(dx + EXTENT, bounds[2]), Math.min(dy + EXTENT, bounds[3])];
    if (box[0] >= box[2] || box[1] >= box[3]) return;
    const fillBox = [
      box[0] === dx ? box[0] - MARGIN : box[0], box[1] === dy ? box[1] - MARGIN : box[1],
      box[2] === dx + EXTENT ? box[2] + MARGIN : box[2], box[3] === dy + EXTENT ? box[3] + MARGIN : box[3],
    ].map((v, k) => Math.max(bounds[k % 2], Math.min(bounds[2 + (k % 2)], v)));
    const layers = readTile(bytes);
    for (const [name, layer] of Object.entries(layers)) {
      if (layer.extent !== EXTENT) throw new Error('Unexpected extent ' + layer.extent);
      for (const feature of layer.features) {
        const parts = feature.rings.map((part) => part.map((v, k) => v + (k % 2 ? dy : dx)));
        if (feature.type === 3) {
          const target = fillLayer(name, feature.props);
          if (!target) continue;
          // Each polygon is an outer ring followed by its holes.
          let polygon = null;
          for (const ring of parts) {
            const area = ringArea(ring);
            if (area === 0) continue;
            const clipped = clipRing(ring, ...fillBox);
            if (area > 0) {
              polygon = clipped ? [clipped] : null;
              if (polygon) {
                if (target === 'buildings') polygon.height = buildingHeight(feature.props);
                fills[target].push(polygon);
              }
            } else if (polygon && clipped) polygon.push(clipped);
          }
        } else if (feature.type === 2) {
          const target = lineLayer(name, feature.props);
          if (!target) continue;
          for (const part of parts) {
            for (const piece of clipLine(part, ...box)) {
              piece.cls = target;
              lines[target].push(piece);
            }
          }
        }
      }
    }
  });

  const out = { layers: {} };
  const stats = [];
  let water = [];
  for (const [name, polygons] of Object.entries(fills)) {
    const kept = [];
    for (const polygon of polygons) {
      const rings = polygon
        .map((ring) => simplify(roundPart(ring, step), (name === 'buildings' ? 0.75 : 1.5) * step, true, pinned))
        .filter((ring) => ring.length >= 6 && Math.abs(ringArea(ring)) > 0);
      if (!rings.length || ringArea(rings[0]) <= 0) continue;
      if (name === 'buildings' && ringArea(rings[0]) < minBuilding) continue;
      rings.height = polygon.height;
      kept.push(rings);
    }
    kept.sort((a, b) => hilbertOf(a[0], bounds) - hilbertOf(b[0], bounds));
    if (name === 'water') water = kept;
    const enc = encoder();
    for (const rings of kept) {
      enc.count(rings.length);
      for (const ring of rings) enc.points(ring);
    }
    out.layers[name] = { type: 'fill', count: kept.length, data: enc.text };
    // One number per building: the height times four, plus 1 when a bottom
    // height follows and 2 when the 3D view leaves it out.
    if (name === 'buildings') {
      const heights = encoder();
      for (const { height: h } of kept) {
        heights.count(h.top * 4 + (h.bottom ? 1 : 0) + (h.hide ? 2 : 0));
        if (h.bottom) heights.count(h.bottom);
      }
      out.layers[name].heights = heights.text;
    }
    stats.push(`${name} ${kept.length}`);
  }

  const inWater = areaTest(water);
  const cutEdge = (ax, ay, bx, by) => (ax === bx && onCut(ax, 0)) || (ay === by && onCut(ay, 1));
  lines.waterways = dropCenterLines(lines.waterways, inWater);
  lines.shore = shoreLines(water, inWater, cutEdge);
  const streetLines = [...lines.major, ...lines.streets];
  lines.paths = dropSidewalks(lines.paths, streetLines, unitM);
  for (const [name, list2] of Object.entries(lines)) {
    const joined = joinLines(list2)
      .map((line) => simplify(roundPart(line, step), 0.75 * step, false, pinned))
      .filter((line) => line.length >= 4 && lineLength(line) > 1);
    joined.sort((a, b) => hilbertOf(a, bounds) - hilbertOf(b, bounds));
    const enc = encoder();
    for (const line of joined) enc.points(line);
    out.layers[name] = { type: 'line', count: joined.length, data: enc.text };
    stats.push(`${name} ${joined.length}`);
  }

  const json = JSON.stringify({
    name: city.name,
    about: city.about,
    lat: city.lat,
    lon: city.lon,
    zoom: ZOOM,
    // Meters per unit, CSS pixels per unit at the starting zoom, the area
    // covered, the starting center, and the grid the fills were cut on.
    unit: +unitM.toFixed(5),
    scale: +(unitM / city.mpp).toFixed(6),
    bounds,
    center: [Math.round(cx - ox), Math.round(cy - oy)],
    grid: EXTENT,
    margin: MARGIN,
    layers: out.layers,
  });
  await writeFile(join(outDir, city.id + '.json'), json);
  const kb = (n) => (n / 1024).toFixed(0) + ' KB';
  console.log(`${city.id}: ${list.length} tiles, ${kb(json.length)}, ${kb(gzipSync(json, { level: 9 }).length)} gzipped (${stats.join(', ')})`);
}

function hilbertOf(part, bounds) {
  let x = 0, y = 0;
  const n = part.length / 2;
  for (let i = 0; i < part.length; i += 2) {
    x += part[i];
    y += part[i + 1];
  }
  const size = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]);
  const hx = Math.max(0, Math.min(65535, Math.floor(((x / n - bounds[0]) / size) * 65535)));
  const hy = Math.max(0, Math.min(65535, Math.floor(((y / n - bounds[1]) / size) * 65535)));
  return hilbert(hx, hy);
}

const wanted = process.argv.slice(2);
const cities = wanted.length ? CITIES.filter((c) => wanted.includes(c.id)) : CITIES;
if (!cities.length) throw new Error('Unknown city. Choose from: ' + CITIES.map((c) => c.id).join(', '));
await mkdir(outDir, { recursive: true });
const template = await tileTemplate();
for (const city of cities) await build(city, template);
