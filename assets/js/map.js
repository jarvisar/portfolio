(function () {
  'use strict';

  const cover = document.querySelector('.cover[data-map]');
  if (!cover || !window.Path2D || !window.fetch || !window.requestAnimationFrame) return;

  const root = new URL('../../', document.currentScript.src);
  const canvas = cover.querySelector('.map-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const citySelect = document.getElementById('map-city');
  const styleSelect = document.getElementById('map-style');
  const tourButton = cover.querySelector('[data-tour]');
  const status = cover.querySelector('.map-status');
  const scaleBar = cover.querySelector('.map-scale');
  const penTip = cover.querySelector('.map-pen');
  const title = cover.querySelector('.map-title');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

  // The banner on a wide screen, which the starting zoom is set for.
  const DESIGN_WIDTH = 978;
  const DESIGN_HEIGHT = 298;
  const MAX_ZOOM = 4;
  const TILE = 512;

  /* Styles. The print themes are SVGmap's. `ink` is for the title block,
     where the roads color doesn't suit. */

  const STYLES = {
    classic: { paper: '#F5F0E6', greens: '#CADDB4', water: '#A7C7E0', buildings: '#C9BDAE', roads: '#3A3A3A', paths: '#8A8A8A', rail: '#8C6E5B' },
    minimal: { paper: '#FFFFFF', greens: '#E7EEE0', water: '#DCE7EF', buildings: '#D2D2D2', roads: '#141414', paths: '#7A7A7A', rail: '#141414' },
    blueprint: { paper: '#173A5E', greens: '#1E4468', water: '#244E78', buildings: '#2F5B86', roads: '#EAF2FB', paths: '#9DB7D1', rail: '#EAF2FB' },
    noir: { paper: '#101010', greens: '#1B1B1B', water: '#262626', buildings: '#363636', roads: '#F2F2F2', paths: '#8F8F8F', rail: '#F2F2F2' },
    terracotta: { paper: '#F4E6D6', greens: '#D9D3B2', water: '#BFD3D6', buildings: '#DE9A7D', roads: '#5A3528', paths: '#A0776A', rail: '#5A3528' },
    riso: { paper: '#F3EEE4', greens: '#C4B8D3', water: '#86B9D3', buildings: '#F7BCD4', roads: '#0078BF', paths: '#6DADD0', rail: '#FD61B8', waterways: '#499BCA' },
    midnight: { paper: '#14233D', greens: '#192C46', water: '#091220', buildings: '#22395B', roads: '#D4AF6A', paths: '#8E7A55', rail: '#A8916A' },
    nolli: { paper: '#F7F5F0', greens: '#E3E6DA', water: '#C9D3DA', buildings: '#1C1C1C', roads: '#B5B5B5', paths: '#CFCFCF', rail: '#9A9A9A', ink: '#1C1C1C' },
    // Outlines only, one pen per color, in the order a plotter would draw them.
    plotter: {
      paper: '#FBFAF6',
      ink: '#24272B',
      plot: true,
      pens: [
        { layers: ['greens'], color: '#4E8A4A', width: 0.5 },
        { layers: ['shore', 'waterways'], color: '#2D6DA8', width: 0.6 },
        { layers: ['buildings'], color: '#A4876C', width: 0.4 },
        { layers: ['rail'], color: '#B5482F', width: 0.7 },
        { layers: ['paths', 'service', 'streets', 'major'], color: '#24272B', width: 0.7 }
      ]
    },
    // Engraved and scored into SVGmap's laser materials. The colors multiply
    // the material, so the grain shows through the burn. Slate and acrylic
    // mark light, so theirs are screened instead.
    birch: { paper: '#E9D3AF', laser: true, grain: birchGrain, greens: '#EDE3D2', water: '#7E5E44', buildings: '#D2B898', roads: '#5A3B26', paths: '#8E6E52', rail: '#6E4C34' },
    walnut: { paper: '#76513A', laser: true, grain: walnutGrain, ink: '#180D07', greens: '#CDCBC8', water: '#4D443A', buildings: '#97928D', roads: '#342A1F', paths: '#5D564D', rail: '#40372D' },
    cork: { paper: '#C19869', laser: true, grain: corkGrain, ink: '#362112', greens: '#E0DDDB', water: '#62544A', buildings: '#B0A9A5', roads: '#443428', paths: '#71655C', rail: '#524338' },
    leather: { paper: '#815432', laser: true, grain: leatherGrain, ink: '#1C0F07', greens: '#CDCBC9', water: '#4D433C', buildings: '#98928E', roads: '#342921', paths: '#5E554E', rail: '#41362E' },
    slate: { paper: '#3E4246', laser: true, grain: slateGrain, frost: frostGrain, blend: 'screen', ink: '#D9DCDE', greens: '#1D1E1E', water: '#666869', buildings: '#464748', roads: '#CACDCF', paths: '#8C8E8F', rail: '#ABAEAF' },
    acrylic: { paper: '#151515', laser: true, grain: acrylicGrain, frost: frostGrain, blend: 'screen', ink: '#E6E6E6', greens: '#202020', water: '#676767', buildings: '#444444', roads: '#E0E0E0', paths: '#9B9B9B', rail: '#BFBFBF' },
    // A City Model print: white PLA on a blue water plate, with the tallest
    // buildings in orange. `shore` is the side of the land plate.
    model: {
      paper: '#E6E1D6', model: true, ink: '#4A4339', greens: '#A3CDA0', water: '#3E9ED6', shore: '#B9B0A0',
      roads: '#FBFAF6', paths: '#F2EFE8', rail: '#B4AB9B',
      white: [248, 246, 241], orange: [236, 148, 66], tall: 120, shadow: '#423424', shadowAlpha: 0.24
    }
  };

  // Line widths in CSS pixels at the starting zoom, relative to a street.
  const LINES = [
    { layer: 'waterways', color: 'waterways', width: 0.9 },
    { layer: 'paths', color: 'paths', width: 0.5 },
    { layer: 'rail', color: 'rail', width: 0.85 },
    { layer: 'service', color: 'roads', width: 0.6 },
    { layer: 'streets', color: 'roads', width: 1 },
    { layer: 'major', color: 'roads', width: 1.4 }
  ];
  const STREET_WIDTH = 0.72;

  // The 3D view looks north-northeast, so a roof sits up and to the right of
  // its footprint. Light comes from the west-northwest and shadows fall the
  // other way. LIFT exaggerates heights a little, as the prints do.
  const UP = [0.34, -0.94];
  const LIFT = 0.9;
  const SUN = [0.86, 0.51];
  const SHADOW = 0.45;
  const LAYERS = 14;

  /* Tour: other cities and styles, one after another, until the map is used.
     `dark` replaces a light paper style in dark mode. The first plate stays
     first, since its city loads with the page. `lead` marks the best plates
     for each entry in OPENING, which come next in that order, one of each. */

  const TOUR = [
    { city: 'cincinnati' },
    { city: 'manhattan', style: 'model', lead: true },
    { city: 'amsterdam', style: 'riso', dark: 'noir' },
    { city: 'paris', style: 'plotter', lead: true },
    { city: 'barcelona', style: 'nolli', dark: 'midnight' },
    { city: 'hong-kong', style: 'model', lead: true },
    { city: 'washington', style: 'birch' },
    { city: 'venice', style: 'terracotta', dark: 'blueprint' },
    { city: 'rio', style: 'classic', dark: 'midnight' },
    { city: 'toronto', style: 'model' },
    { city: 'quebec', style: 'plotter' },
    { city: 'pittsburgh', style: 'blueprint' },
    { city: 'new-orleans', style: 'nolli', dark: 'noir' },
    { city: 'melbourne', style: 'model' },
    { city: 'naarden', style: 'plotter', lead: true },
    { city: 'bangkok', style: 'blueprint' },
    { city: 'istanbul', style: 'nolli', dark: 'noir' },
    { city: 'shanghai', style: 'model', lead: true },
    { city: 'london', style: 'blueprint' },
    { city: 'cartagena', style: 'terracotta', dark: 'midnight' },
    { city: 'kyoto', style: 'birch' },
    { city: 'chicago', style: 'model', lead: true },
    { city: 'sydney', style: 'classic', dark: 'midnight' },
    { city: 'monaco', style: 'birch' },
    { city: 'tokyo', style: 'minimal', dark: 'noir' },
    { city: 'dubai', style: 'model', lead: true },
    { city: 'san-francisco', style: 'midnight' },
    { city: 'auckland', style: 'riso', dark: 'blueprint' },
    { city: 'savannah', style: 'walnut' },
    { city: 'miami', style: 'riso', dark: 'midnight' },
    { city: 'portland', style: 'cork' },
    { city: 'boston', style: 'leather' },
    { city: 'perth', style: 'terracotta', dark: 'noir' },
    { city: 'vancouver', style: 'slate' },
    { city: 'singapore', style: 'acrylic', lead: true },
    { city: 'brisbane', style: 'acrylic', lead: true },
    { city: 'ottawa', style: 'acrylic', lead: true },
    { city: 'montreal', style: 'classic', dark: 'midnight' }
  ];
  // The machines first, since their entrances show the most. Each entry is a
  // kind of plate (model, plotter, laser, or print) or a single style.
  const OPENING = ['model', 'plotter', 'acrylic'];
  // Each plate stays up for PLATE ms, entrance included, and at least REST ms
  // after its entrance ends. The map the page opens on stays up for a third
  // of PLATE.
  const PLATE = 4000;
  const REST = 1500;

  /* Data */

  const DIGITS = new Uint8Array(128);
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('').forEach(function (c, i) {
    DIGITS[c.charCodeAt(0)] = i;
  });
  const CHUNK = 160;

  function reader(text) {
    let pos = 0;
    return function () {
      let n = 0;
      let scale = 1;
      let c;
      do {
        c = DIGITS[text.charCodeAt(pos++)];
        n += (c & 31) * scale;
        scale *= 32;
      } while (c & 32);
      return n;
    };
  }

  function decodeLayer(layer) {
    const fill = layer.type === 'fill';
    const read = reader(layer.data);
    let x = 0;
    let y = 0;

    function signed() {
      const n = read();
      return n % 2 ? -(n + 1) / 2 : n / 2;
    }

    const features = [];
    for (let f = 0; f < layer.count; f++) {
      const count = fill ? read() : 1;
      const parts = [];
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      for (let p = 0; p < count; p++) {
        const n = read();
        const points = new Float32Array(n * 2);
        for (let k = 0; k < n; k++) {
          x += signed();
          y += signed();
          points[2 * k] = x;
          points[2 * k + 1] = y;
          if (x < box[0]) box[0] = x;
          if (y < box[1]) box[1] = y;
          if (x > box[2]) box[2] = x;
          if (y > box[3]) box[3] = y;
        }
        parts.push(points);
      }
      features.push({ parts: parts, box: box });
    }

    // Features come in Hilbert order, so runs of them make compact chunks.
    const chunks = [];
    for (let start = 0; start < features.length; start += CHUNK) {
      const path = new Path2D();
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      const end = Math.min(features.length, start + CHUNK);
      for (let f = start; f < end; f++) {
        const feature = features[f];
        for (const points of feature.parts) {
          path.moveTo(points[0], points[1]);
          for (let k = 2; k < points.length; k += 2) path.lineTo(points[k], points[k + 1]);
          if (fill) path.closePath();
        }
        box[0] = Math.min(box[0], feature.box[0]);
        box[1] = Math.min(box[1], feature.box[1]);
        box[2] = Math.max(box[2], feature.box[2]);
        box[3] = Math.max(box[3], feature.box[3]);
      }
      chunks.push({ path: path, box: box, start: start, end: end, outline: null });
    }
    return { fill: fill, features: features, chunks: chunks };
  }

  // Heights in meters, one number per building: the height times four, plus
  // 1 when a bottom height follows and 2 for outlines drawn as parts instead.
  function decodeHeights(layer, text) {
    const n = layer.features.length;
    layer.top = new Float32Array(n);
    layer.bottom = new Float32Array(n);
    layer.hide = new Uint8Array(n);
    layer.maxTop = 0;
    if (!text) return;
    const read = reader(text);
    for (let f = 0; f < n; f++) {
      const v = read();
      layer.top[f] = Math.floor(v / 4);
      if (v & 1) layer.bottom[f] = read();
      if (v & 2) layer.hide[f] = 1;
      else layer.maxTop = Math.max(layer.maxTop, layer.top[f]);
    }
  }

  function prepare(json) {
    const layers = {};
    Object.keys(json.layers).forEach(function (name) {
      layers[name] = decodeLayer(json.layers[name]);
    });
    decodeHeights(layers.buildings, json.layers.buildings.heights);
    json.layers = layers;
    return json;
  }

  // Each city takes several megabytes once decoded, so only the last few are kept.
  const loads = new Map();
  const KEEP = 3;

  function load(id) {
    let promise = loads.get(id);
    if (promise) {
      loads.delete(id);
    } else {
      promise = fetch(new URL('assets/maps/' + id + '.json', root))
        .then(function (response) {
          if (!response.ok) throw new Error(String(response.status));
          return response.json();
        })
        .then(function (json) {
          json.id = id;
          return prepare(json);
        });
      promise.catch(function () {
        if (loads.get(id) === promise) loads.delete(id);
      });
    }
    loads.set(id, promise);
    for (const key of loads.keys()) {
      if (loads.size <= KEEP) break;
      if (key !== id && (!state.map || key !== state.map.id)) loads.delete(key);
    }
    return promise;
  }

  // Fills were cut along the tile grid and the edges of the area. Those edges
  // aren't part of the outline, so the plotter and the 3D walls leave them out.
  function cutTest(map) {
    const grid = map.grid;
    const margin = map.margin;
    const b = map.bounds;
    return function (v, axis) {
      return v === b[axis] || v === b[axis + 2] || (v + margin) % grid === 0 || (v - margin) % grid === 0;
    };
  }

  function outlinesOf(map, feature) {
    const cut = map.cut || (map.cut = cutTest(map));
    const lines = [];
    for (const ring of feature.parts) {
      const n = ring.length / 2;
      let start = -1;
      // Start after a cut edge, so a line doesn't wrap around the seam.
      for (let i = 0; i < n && start < 0; i++) {
        const j = (i + 1) % n;
        const ax = ring[2 * i], ay = ring[2 * i + 1], bx = ring[2 * j], by = ring[2 * j + 1];
        if ((ax === bx && cut(ax, 0)) || (ay === by && cut(ay, 1))) start = j;
      }
      if (start < 0) {
        const closed = new Float32Array(ring.length + 2);
        closed.set(ring);
        closed[ring.length] = ring[0];
        closed[ring.length + 1] = ring[1];
        lines.push(closed);
        continue;
      }
      let current = [ring[2 * start], ring[2 * start + 1]];
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n;
        const j = (i + 1) % n;
        const ax = ring[2 * i], ay = ring[2 * i + 1], bx = ring[2 * j], by = ring[2 * j + 1];
        if ((ax === bx && cut(ax, 0)) || (ay === by && cut(ay, 1))) {
          if (current.length >= 4) lines.push(new Float32Array(current));
          current = [bx, by];
        } else current.push(bx, by);
      }
      if (current.length >= 4) lines.push(new Float32Array(current));
    }
    return lines;
  }

  function outlinePath(map, layer, chunk) {
    if (!chunk.outline) {
      const path = new Path2D();
      for (let f = chunk.start; f < chunk.end; f++) {
        for (const line of outlinesOf(map, layer.features[f])) {
          path.moveTo(line[0], line[1]);
          for (let k = 2; k < line.length; k += 2) path.lineTo(line[k], line[k + 1]);
        }
      }
      chunk.outline = path;
    }
    return chunk.outline;
  }

  // Lengths in the data are map units. The data is at one zoom, so the
  // Mercator math only needs its origin.
  function lonLatAt(map, x, y) {
    const world = Math.pow(2, map.zoom || 14) * map.grid;
    if (!map.origin) {
      const lat = (map.lat * Math.PI) / 180;
      map.origin = [
        ((map.lon + 180) / 360) * world - map.center[0],
        ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * world - map.center[1]
      ];
    }
    const lon = ((x + map.origin[0]) / world) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + map.origin[1])) / world))) * 180) / Math.PI;
    return [lon, lat];
  }

  function formatLonLat(lon, lat) {
    return Math.abs(lat).toFixed(4) + '° ' + (lat < 0 ? 'S' : 'N') + ', ' +
      Math.abs(lon).toFixed(4) + '° ' + (lon < 0 ? 'W' : 'E');
  }

  /* Drawing */

  function hits(a, b) {
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  }

  // Lines get wider when zoomed in, but slower than the map does.
  function lineScale(map, scale) {
    return STREET_WIDTH * Math.pow(scale / map.scale, 0.55);
  }

  // Draws the map into a context whose transform maps units to device
  // pixels at `scale` CSS pixels per unit. `box` is the area in units.
  function drawMap(c, map, style, scale, ratio, box) {
    const unit = 1 / (scale * ratio);
    const px = lineScale(map, scale) / scale;
    const reach = [box[0] - 4 * px, box[1] - 4 * px, box[2] + 4 * px, box[3] + 4 * px];
    c.lineCap = 'round';
    c.lineJoin = 'round';

    if (style.plot) {
      for (const p of style.pens) {
        c.strokeStyle = p.color;
        c.lineWidth = Math.max(p.width * Math.pow(scale / map.scale, 0.45) / scale, unit);
        for (const name of p.layers) {
          const layer = map.layers[name];
          for (const chunk of layer.chunks) {
            if (hits(chunk.box, reach)) c.stroke(layer.fill ? outlinePath(map, layer, chunk) : chunk.path);
          }
        }
      }
      return;
    }

    if (style.model) {
      drawGround(c, map, style, scale, ratio, box);
      drawBuildings(c, map, style, scale, ratio, box, 1);
      return;
    }

    if (style.laser) {
      c.fillStyle = materialPattern(style.grain, map, scale);
      c.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
      c.globalCompositeOperation = style.blend || 'multiply';
    }
    fillLayer(c, map.layers.greens, style.greens, box);
    fillLayer(c, map.layers.water, style.water, box);
    drawLines(c, map, style, px, unit, reach, true);
    fillLayer(c, map.layers.buildings, style.buildings, box);
    drawLines(c, map, style, px, unit, reach, false);
    // The burn roughens a light mark. Multiplied over the dark surface, the
    // same grain barely shows.
    if (style.frost) {
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = materialPattern(style.frost, map, scale);
      c.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    }
    c.globalCompositeOperation = 'source-over';
  }

  // Waterways go under the buildings and everything else over them.
  function drawLines(c, map, style, px, unit, reach, water) {
    for (const line of LINES) {
      if ((line.layer === 'waterways') !== water) continue;
      const color = style[line.color] || style.water;
      strokeLayer(c, map.layers[line.layer], color, Math.max(line.width * px, unit * (water ? 1 : 0.8)), reach);
    }
  }

  /* Laser materials. Each texture is made from noise that repeats every GRAIN
     pixels, so it tiles. It is laid out in map units, so it lines up across
     tiles and moves with the map. */

  const GRAIN = 512;
  const textures = new Map();

  function texture(grain) {
    let surface = textures.get(grain);
    if (surface) return surface;
    surface = document.createElement('canvas');
    surface.width = GRAIN;
    surface.height = GRAIN;
    const c = surface.getContext('2d');
    const image = c.createImageData(GRAIN, GRAIN);
    const d = image.data;
    const rgb = [0, 0, 0];
    const pixel = grain();
    for (let y = 0; y < GRAIN; y++) {
      for (let x = 0; x < GRAIN; x++) {
        pixel(x, y, rgb);
        const k = 4 * (y * GRAIN + x);
        d[k] = rgb[0];
        d[k + 1] = rgb[1];
        d[k + 2] = rgb[2];
        d[k + 3] = 255;
      }
    }
    c.putImageData(image, 0, 0);
    textures.set(grain, surface);
    return surface;
  }

  // Value noise and cell noise from one seeded generator.
  function noise(seed) {
    function random() {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    }
    return {
      // Random values on an nx by ny grid, blended smoothly.
      lattice: function (nx, ny) {
        ny = ny || nx;
        const v = new Float32Array(nx * ny);
        for (let i = 0; i < v.length; i++) v[i] = random();
        return function (x, y) {
          const fx = (x / GRAIN) * nx;
          const fy = (y / GRAIN) * ny;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const tx = fx - x0;
          const ty = fy - y0;
          const sx = tx * tx * (3 - 2 * tx);
          const sy = ty * ty * (3 - 2 * ty);
          const at = function (i, j) {
            return v[((j % ny) + ny) % ny * nx + ((i % nx) + nx) % nx];
          };
          const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
          const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
          return a + (b - a) * sy;
        };
      },
      // A random point in each cell of an n by n grid. Gives the distances to
      // the nearest and next nearest points, in cells, and a random value for
      // the nearest one. The result is reused between calls.
      cells: function (n) {
        const px = new Float32Array(n * n);
        const py = new Float32Array(n * n);
        const pv = new Float32Array(n * n);
        for (let i = 0; i < n * n; i++) {
          px[i] = random();
          py[i] = random();
          pv[i] = random();
        }
        const hit = { near: 0, next: 0, value: 0 };
        return function (x, y) {
          const fx = (x / GRAIN) * n;
          const fy = (y / GRAIN) * n;
          const cx = Math.floor(fx);
          const cy = Math.floor(fy);
          let near = Infinity;
          let next = Infinity;
          for (let j = cy - 1; j <= cy + 1; j++) {
            for (let i = cx - 1; i <= cx + 1; i++) {
              const k = ((j % n) + n) % n * n + ((i % n) + n) % n;
              const dx = i + px[k] - fx;
              const dy = j + py[k] - fy;
              const dd = dx * dx + dy * dy;
              if (dd < near) {
                next = near;
                near = dd;
                hit.value = pv[k];
              } else if (dd < next) next = dd;
            }
          }
          hit.near = Math.sqrt(near);
          hit.next = Math.sqrt(next);
          return hit;
        };
      }
    };
  }

  // Rings warped by noise.
  function birchGrain() {
    const n = noise(7);
    const broad = n.lattice(4);
    const fine = n.lattice(16);
    const speck = n.lattice(128);
    return function (x, y, rgb) {
      const warp = broad(x, y) * 1.6 + fine(x, y) * 0.35;
      const ring = 0.5 + 0.5 * Math.sin(2 * Math.PI * (y / GRAIN * 14 + warp));
      const line = Math.pow(ring, 6);
      const shade = 1 - line * 0.13 - broad(y, x) * 0.05 - speck(x, y) * 0.04;
      rgb[0] = 243 * shade;
      rgb[1] = 224 * shade;
      rgb[2] = 191 * shade;
    };
  }

  // Tighter, darker rings, with pores drawn out along the grain.
  function walnutGrain() {
    const n = noise(11);
    const broad = n.lattice(3);
    const fine = n.lattice(12);
    const figure = n.lattice(6);
    const pores = n.lattice(24, 320);
    const speck = n.lattice(128);
    return function (x, y, rgb) {
      const warp = broad(x, y) * 2.4 + fine(x, y) * 0.45;
      const ring = 0.5 + 0.5 * Math.sin(2 * Math.PI * (y / GRAIN * 24 + warp));
      const dark = Math.pow(ring, 3) * 0.55 + figure(x, y) * 0.45;
      const pore = Math.max(0, pores(x, y) - 0.7) * 2.2;
      const shade = 1 - pore * 0.5 - speck(x, y) * 0.05;
      rgb[0] = (132 - 34 * dark) * shade;
      rgb[1] = (91 - 25 * dark) * shade;
      rgb[2] = (65 - 18 * dark) * shade;
    };
  }

  // Granules of two sizes in different tones, with gaps and pits between them.
  function corkGrain() {
    const n = noise(23);
    const big = n.cells(64);
    const small = n.cells(150);
    const blot = n.lattice(8);
    const pits = n.lattice(256);
    return function (x, y, rgb) {
      const a = big(x, y);
      const b = small(x, y);
      const tone = 0.45 * a.value + 0.4 * b.value + 0.15 * blot(x, y);
      const gap = Math.max(0, 1 - (a.next - a.near) / 0.15) * 0.6 + Math.max(0, 1 - (b.next - b.near) / 0.12) * 0.3;
      const pit = Math.max(0, pits(x, y) - 0.78) * 3;
      const shade = 0.82 + 0.38 * tone - gap * 0.25 - pit * 0.5;
      rgb[0] = 201 * shade;
      rgb[1] = 162 * shade * (0.95 + 0.05 * tone);
      rgb[2] = 115 * shade * (0.9 + 0.1 * tone);
    };
  }

  // Pebbled grain: small domes with creases between them, over soft folds.
  function leatherGrain() {
    const n = noise(31);
    const pebble = n.cells(128);
    const fold = n.lattice(5);
    const mottle = n.lattice(18);
    const speck = n.lattice(160);
    return function (x, y, rgb) {
      const p = pebble(x, y);
      const edge = Math.min(1, (p.next - p.near) / 0.3);
      const crease = 1 - edge * edge * (3 - 2 * edge);
      const dome = Math.max(0, 1 - p.near / 0.7);
      const shade = 0.95 + 0.06 * dome - 0.14 * crease + (fold(x, y) - 0.5) * 0.14 + (mottle(x, y) - 0.5) * 0.08 - speck(x, y) * 0.03;
      rgb[0] = 141 * shade;
      rgb[1] = 92 * shade;
      rgb[2] = 55 * shade;
    };
  }

  // Mottled stone with faint cleavage lines and grit.
  function slateGrain() {
    const n = noise(43);
    const broad = n.lattice(3);
    const mid = n.lattice(10);
    const fine = n.lattice(64);
    const grit = n.lattice(256);
    return function (x, y, rgb) {
      const band = Math.sin(2 * Math.PI * ((x + 3 * y) / GRAIN * 3 + broad(x, y) * 1.5));
      const shade = 1 + (broad(y, x) - 0.5) * 0.14 + (mid(x, y) - 0.5) * 0.1 + band * 0.025 + (fine(x, y) - 0.5) * 0.08 + (grit(x, y) - 0.5) * 0.12;
      const tint = mid(y, x) - 0.5;
      rgb[0] = (62 - tint * 4) * shade;
      rgb[1] = 66 * shade;
      rgb[2] = (70 + tint * 5) * shade;
    };
  }

  // Gloss black, with soft reflections.
  function acrylicGrain() {
    const n = noise(59);
    const broad = n.lattice(2);
    const soft = n.lattice(5);
    return function (x, y, rgb) {
      const shade = 21 + (broad(x, y) - 0.5) * 10 + (soft(x, y) - 0.5) * 4;
      rgb[0] = shade;
      rgb[1] = shade;
      rgb[2] = shade + 1;
    };
  }

  // Fine grit, nearly white, for the frosted look of a light mark.
  function frostGrain() {
    const n = noise(67);
    const grit = n.lattice(256);
    const fine = n.lattice(128);
    const blot = n.lattice(24);
    return function (x, y, rgb) {
      const shade = 255 * (0.8 + 0.12 * grit(x, y) + 0.05 * fine(x, y) + 0.03 * blot(x, y));
      rgb[0] = shade;
      rgb[1] = shade;
      rgb[2] = shade;
    };
  }

  function materialPattern(grain, map, scale) {
    const pattern = ctx.createPattern(texture(grain), 'repeat');
    // About 640 CSS pixels to the repeat at the starting zoom, growing slower than the map.
    const css = 640 * Math.pow(scale / map.scale, 0.5);
    const k = css / GRAIN / scale;
    if (pattern.setTransform && window.DOMMatrix) pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    return pattern;
  }

  // All the chunks in one path, so pieces cut at a tile edge fill without a seam.
  function layerPath(layer, box) {
    let path = null;
    for (const chunk of layer.chunks) {
      if (!hits(chunk.box, box)) continue;
      if (!path) path = new Path2D();
      path.addPath(chunk.path);
    }
    return path;
  }

  function fillLayer(c, layer, color, box) {
    const path = layerPath(layer, box);
    if (path) {
      c.fillStyle = color;
      c.fill(path);
    }
  }

  function strokeLayer(c, layer, color, width, box) {
    c.strokeStyle = color;
    c.lineWidth = width;
    for (const chunk of layer.chunks) {
      if (hits(chunk.box, box)) c.stroke(chunk.path);
    }
  }

  /* City model */

  // The land is a plate a little above the water. Its thickness in units,
  // growing slower than the map, like the lines.
  function plateOf(map, scale) {
    return 2.4 * Math.pow(scale / map.scale, 0.5) / scale;
  }

  function drawGround(c, map, style, scale, ratio, box) {
    const unit = 1 / (scale * ratio);
    const px = lineScale(map, scale) / scale;
    const lift = plateOf(map, scale);
    const lx = UP[0] * lift;
    const ly = UP[1] * lift;
    const reach = [box[0] - 4 * px - lx, box[1] - 4 * px, box[2] + 4 * px, box[3] + 4 * px - ly];
    c.lineCap = 'round';
    c.lineJoin = 'round';

    // Water shows through holes in the raised land, and the side of the
    // land shows where the hole has moved off the water.
    const water = layerPath(map.layers.water, reach);
    if (water) {
      c.save();
      c.translate(lx, ly);
      c.clip(water);
      c.translate(-lx, -ly);
      c.fillStyle = style.shore;
      c.fillRect(reach[0], reach[1], reach[2] - reach[0], reach[3] - reach[1]);
      c.fillStyle = style.water;
      c.fill(water);
      c.restore();
    }

    c.save();
    c.translate(lx, ly);
    fillLayer(c, map.layers.greens, style.greens, reach);
    drawLines(c, map, style, px, unit, reach, true);
    drawLines(c, map, style, px, unit, reach, false);
    c.restore();
  }

  // Meters of height per unit of lift. Maps that start zoomed out further
  // than about 6 meters to the pixel get taller buildings, or most of them
  // would be a pixel high.
  function heightUnit(map) {
    const mpp = map.unit / map.scale;
    return map.unit / Math.max(1, Math.pow(mpp / 6, 0.75));
  }

  // Wall colors from dark to light, for each color of plastic.
  function materials(style) {
    if (style.materials) return style.materials;
    const make = function (rgb) {
      const walls = [];
      for (let i = 0; i < 8; i++) {
        const k = 0.6 + (0.33 * i) / 7;
        walls.push('rgb(' + rgb.map(function (v) { return Math.round(v * k); }).join(',') + ')');
      }
      return {
        roof: 'rgb(' + rgb.join(',') + ')',
        edge: 'rgb(' + rgb.map(function (v) { return Math.round(v * 0.86); }).join(',') + ')',
        walls: walls
      };
    };
    style.materials = { white: make(style.white), orange: make(style.orange) };
    return style.materials;
  }

  // Shadows go on a layer of their own at full strength, which is then laid
  // over the ground, so where two overlap the ground is only darkened once.
  // One path for all of them would do the same but is far slower to fill.
  let shadowCanvas = null;

  function drawShadows(c, map, style, list, shade, unit) {
    if (!c.getTransform) return;
    const W = c.canvas.width;
    const H = c.canvas.height;
    if (!shadowCanvas) shadowCanvas = document.createElement('canvas');
    if (shadowCanvas.width !== W || shadowCanvas.height !== H) {
      shadowCanvas.width = W;
      shadowCanvas.height = H;
    }
    const s2 = shadowCanvas.getContext('2d');
    s2.setTransform(1, 0, 0, 1, 0, 0);
    s2.clearRect(0, 0, W, H);
    s2.setTransform(c.getTransform());
    s2.fillStyle = style.shadow;
    const layer = map.layers.buildings;
    for (const f of list) {
      const s = layer.top[f] * shade;
      if (s < unit) continue;
      const sx = SUN[0] * s;
      const sy = SUN[1] * s;
      const ring = layer.features[f].parts[0];
      const n = ring.length / 2;
      // Each edge swept along the shadow, and the far end. All are wound
      // the same way, so they add up instead of cutting holes.
      s2.beginPath();
      s2.moveTo(ring[0] + sx, ring[1] + sy);
      for (let k = 2; k < ring.length; k += 2) s2.lineTo(ring[k] + sx, ring[k + 1] + sy);
      s2.closePath();
      for (let i = 0; i < n; i++) {
        const j = i + 1 < n ? i + 1 : 0;
        const ax = ring[2 * i], ay = ring[2 * i + 1], bx = ring[2 * j], by = ring[2 * j + 1];
        if ((bx - ax) * sy - (by - ay) * sx >= 0) {
          s2.moveTo(ax, ay);
          s2.lineTo(bx, by);
          s2.lineTo(bx + sx, by + sy);
          s2.lineTo(ax + sx, ay + sy);
        } else {
          s2.moveTo(ax, ay);
          s2.lineTo(ax + sx, ay + sy);
          s2.lineTo(bx + sx, by + sy);
          s2.lineTo(bx, by);
        }
        s2.closePath();
      }
      s2.fill();
    }
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = style.shadowAlpha;
    c.drawImage(shadowCanvas, 0, 0);
    c.restore();
  }

  // The buildings in `box`, back to front, with heights scaled by `rise`.
  function modelList(map, box, rise) {
    const layer = map.layers.buildings;
    const per = (LIFT * rise) / heightUnit(map);
    const shade = (SHADOW * rise) / heightUnit(map);
    const maxLift = layer.maxTop * per;
    const maxShade = layer.maxTop * shade;
    const reach = [
      box[0] - UP[0] * maxLift - SUN[0] * maxShade,
      box[1] - SUN[1] * maxShade,
      box[2],
      box[3] - UP[1] * maxLift
    ];
    const list = [];
    for (const chunk of layer.chunks) {
      if (!hits(chunk.box, reach)) continue;
      for (let f = chunk.start; f < chunk.end; f++) {
        if (layer.hide[f]) continue;
        const b = layer.features[f].box;
        const up = layer.top[f] * per;
        const down = layer.top[f] * shade;
        if (b[0] > box[2] || b[2] + Math.max(UP[0] * up, SUN[0] * down) < box[0] ||
            b[1] + UP[1] * up > box[3] || b[3] + SUN[1] * down < box[1]) continue;
        list.push(f);
      }
    }
    // By the corner nearest the viewer.
    if (!layer.keys) {
      layer.keys = new Float32Array(layer.features.length);
      layer.features.forEach(function (feature, f) {
        layer.keys[f] = -UP[0] * feature.box[0] - UP[1] * feature.box[3];
      });
    }
    const keys = layer.keys;
    list.sort(function (a, b) { return keys[a] - keys[b]; });
    return list;
  }

  function drawBuildings(c, map, style, scale, ratio, box, rise) {
    const layer = map.layers.buildings;
    const features = layer.features;
    const unit = 1 / (scale * ratio);
    const lift = plateOf(map, scale);
    const per = (LIFT * rise) / heightUnit(map);
    const shade = (SHADOW * rise) / heightUnit(map);
    const cut = map.cut || (map.cut = cutTest(map));
    const mats = materials(style);
    const list = modelList(map, [box[0] - UP[0] * lift, box[1], box[2], box[3] - UP[1] * lift], rise);

    c.save();
    c.translate(UP[0] * lift, UP[1] * lift);

    if (rise > 0) drawShadows(c, map, style, list, shade, unit);

    c.lineJoin = 'round';
    c.lineWidth = Math.max(0.35 * Math.pow(scale / map.scale, 0.4) / scale, unit * 0.6);
    for (const f of list) {
      const feature = features[f];
      const top = layer.top[f] * per;
      const bottom = layer.bottom[f] * per;
      const mat = layer.top[f] >= style.tall ? mats.orange : mats.white;
      const tx = UP[0] * top, ty = UP[1] * top;
      const bx = UP[0] * bottom, by = UP[1] * bottom;
      if (top - bottom > unit * 0.5) {
        for (const ring of feature.parts) {
          const n = ring.length / 2;
          for (let i = 0; i < n; i++) {
            const j = i + 1 < n ? i + 1 : 0;
            const ax = ring[2 * i], ay = ring[2 * i + 1], cx = ring[2 * j], cy = ring[2 * j + 1];
            const dx = cx - ax, dy = cy - ay;
            // The outward normal is (dy, -dx). Walls facing away are behind the roof.
            if (dx * UP[1] - dy * UP[0] <= 0) continue;
            if ((dx === 0 && cut(ax, 0)) || (dy === 0 && cut(ay, 1))) continue;
            const light = (-dy * SUN[0] + dx * SUN[1]) / Math.hypot(dx, dy);
            c.fillStyle = mat.walls[Math.round((light * 0.5 + 0.5) * 7)];
            c.beginPath();
            c.moveTo(ax + bx, ay + by);
            c.lineTo(cx + bx, cy + by);
            c.lineTo(cx + tx, cy + ty);
            c.lineTo(ax + tx, ay + ty);
            c.closePath();
            c.fill();
          }
        }
      }
      c.beginPath();
      for (const ring of feature.parts) {
        c.moveTo(ring[0] + tx, ring[1] + ty);
        for (let k = 2; k < ring.length; k += 2) c.lineTo(ring[k] + tx, ring[k + 1] + ty);
        c.closePath();
      }
      c.fillStyle = mat.roof;
      c.fill();
      c.strokeStyle = mat.edge;
      c.stroke();
    }
    c.restore();
  }

  /* Tiles: TILE device pixels square, rendered at the exact scale shown, so
     they map one to one onto the screen once the map stops moving. */

  const tiles = new Map();
  let maxTiles = 48;

  function tileKey(map, styleId, scale, ratio, i, j) {
    return map.id + '|' + styleId + '|' + scale + '|' + ratio + '|' + i + '|' + j;
  }

  function renderTile(map, styleId, scale, ratio, i, j) {
    const style = STYLES[styleId];
    const tile = document.createElement('canvas');
    tile.width = TILE;
    tile.height = TILE;
    const c = tile.getContext('2d', { alpha: false });
    const k = scale * ratio;
    const size = TILE / k;
    const x0 = i * size;
    const y0 = j * size;
    c.fillStyle = style.paper;
    c.fillRect(0, 0, TILE, TILE);
    c.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    drawMap(c, map, style, scale, ratio, [x0, y0, x0 + size, y0 + size]);
    return tile;
  }

  function getTile(key) {
    const tile = tiles.get(key);
    if (tile) {
      tiles.delete(key);
      tiles.set(key, tile);
    }
    return tile;
  }

  // Safari holds on to a canvas's memory until its size is zeroed.
  function putTile(key, tile) {
    tiles.set(key, tile);
    while (tiles.size > maxTiles) {
      const oldest = tiles.keys().next().value;
      tiles.get(oldest).width = 0;
      tiles.delete(oldest);
    }
  }

  function clearTiles() {
    tiles.forEach(function (tile) {
      tile.width = 0;
    });
    tiles.clear();
  }

  /* View */

  const state = {
    map: null,
    placed: false,
    styleId: null,
    picked: false,
    cx: 0,
    cy: 0,
    scale: 1,
    // The scale tiles are rendered at. It trails `scale` while zooming.
    tileScale: 1,
    oldScale: null,
    width: 0,
    height: 0,
    ratio: 1
  };

  function minScale() {
    const b = state.map.bounds;
    return Math.max(state.width / (b[2] - b[0]), state.height / (b[3] - b[1]));
  }

  function maxScale() {
    return state.map.scale * MAX_ZOOM;
  }

  function clampView() {
    const b = state.map.bounds;
    state.scale = Math.min(Math.max(state.scale, minScale()), Math.max(maxScale(), minScale()));
    const hw = state.width / 2 / state.scale;
    const hh = state.height / 2 / state.scale;
    state.cx = Math.min(Math.max(state.cx, b[0] + hw), b[2] - hw);
    state.cy = Math.min(Math.max(state.cy, b[1] + hh), b[3] - hh);
  }

  function homeScale(map) {
    return map.scale * Math.max(state.width / DESIGN_WIDTH, state.height / DESIGN_HEIGHT);
  }

  function resetView() {
    state.placed = true;
    state.cx = state.map.center[0];
    state.cy = state.map.center[1];
    state.scale = homeScale(state.map);
    clampView();
    settle();
  }

  // Starts rendering tiles at the current scale, keeping the old ones to
  // draw underneath until the new ones are done.
  function settle() {
    if (state.tileScale !== state.scale) {
      state.oldScale = state.tileScale;
      state.tileScale = state.scale;
    }
    redraw();
  }

  function viewBox() {
    const hw = state.width / 2 / state.scale;
    const hh = state.height / 2 / state.scale;
    return [state.cx - hw, state.cy - hh, state.cx + hw, state.cy + hh];
  }

  /* Frames */

  let frameId = 0;
  let fade = null;
  let plot = null;
  let build = null;
  let motion = null;
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  let engaged = false;

  function redraw() {
    if (!frameId) frameId = requestAnimationFrame(frame);
  }

  // Also called directly after a resize, so the canvas never shows blank.
  function frame(now) {
    cancelAnimationFrame(frameId);
    frameId = 0;
    if (!state.map) return;
    let busy = false;

    if (motion) busy = motion(now) || busy;
    if (plot) busy = plotStep(now) || busy;
    if (build) busy = buildStep(now) || busy;

    const covered = plot || build;
    const missing = covered ? [] : neededTiles(state.tileScale, 0);
    renderSome(missing, 10);
    const complete = missing.every(function (t) { return t.done; });
    if (!complete) busy = true;
    else state.oldScale = null;
    // Once the pointer is on the map, the tiles around the view are drawn
    // while it is still, so the first drag doesn't wait for them.
    if (complete && engaged && !covered && !motion && !pointers.size) {
      const around = neededTiles(state.tileScale, 1);
      if (around.length) {
        renderSome(around, 6);
        busy = true;
      }
    }

    composite(now, complete);
    if (fade) busy = true;
    updateScale();
    if (busy) redraw();
  }

  // At least one tile, then more until `budget` milliseconds are used.
  function renderSome(list, budget) {
    const started = performance.now();
    for (const t of list) {
      if (performance.now() - started > budget) break;
      putTile(t.key, renderTile(state.map, state.styleId, state.tileScale, state.ratio, t.i, t.j));
      t.done = true;
    }
  }

  // The tiles in view, plus `margin` more on each side, that aren't drawn yet.
  function neededTiles(scale, margin) {
    const k = scale * state.ratio;
    const size = TILE / k;
    const box = viewBox();
    const b = state.map.bounds;
    const i0 = Math.max(Math.floor(box[0] / size) - margin, Math.floor(b[0] / size));
    const i1 = Math.min(Math.floor(box[2] / size) + margin, Math.floor(b[2] / size));
    const j0 = Math.max(Math.floor(box[1] / size) - margin, Math.floor(b[1] / size));
    const j1 = Math.min(Math.floor(box[3] / size) + margin, Math.floor(b[3] / size));
    const out = [];
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = tileKey(state.map, state.styleId, scale, state.ratio, i, j);
        if (!tiles.has(key)) {
          const dx = (i + 0.5) * size - state.cx;
          const dy = (j + 0.5) * size - state.cy;
          out.push({ key: key, i: i, j: j, d: dx * dx + dy * dy, done: false });
        }
      }
    }
    return out.sort(function (a, b) { return a.d - b.d; });
  }

  function drawTiles(scale) {
    const ratio = state.ratio;
    const k = scale * ratio;
    const size = TILE / k;
    const box = viewBox();
    const zoom = state.scale / scale;
    const W = canvas.width;
    const H = canvas.height;
    let ox = W / 2 - state.cx * state.scale * ratio;
    let oy = H / 2 - state.cy * state.scale * ratio;
    if (zoom === 1) {
      ox = Math.round(ox);
      oy = Math.round(oy);
    }
    const step = TILE * zoom;
    const i0 = Math.floor(box[0] / size), i1 = Math.floor(box[2] / size);
    const j0 = Math.floor(box[1] / size), j1 = Math.floor(box[3] / size);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const tile = getTile(tileKey(state.map, state.styleId, scale, ratio, i, j));
        if (!tile) continue;
        // Shared edges between neighbors, so scaled tiles don't leave gaps.
        const x = Math.round(i * step + ox);
        const y = Math.round(j * step + oy);
        ctx.drawImage(tile, x, y, Math.round((i + 1) * step + ox) - x, Math.round((j + 1) * step + oy) - y);
      }
    }
  }

  function composite(now, complete) {
    const style = STYLES[state.styleId];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = style.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (plot) ctx.drawImage(plot.canvas, 0, 0);
    else if (build) ctx.drawImage(build.canvas, 0, 0);
    else {
      if (state.oldScale !== null) drawTiles(state.oldScale);
      drawTiles(state.tileScale);
    }
    if (!fade) return;
    // Holds the old picture until the new tiles are all in, then takes it away.
    if (fade.start === null && (complete || plot || build)) fade.start = now;
    const t = fade.start === null ? 0 : (now - fade.start) / fade.duration;
    if (t >= 1) {
      fade.canvas.width = 0;
      fade = null;
      return;
    }
    if (fade.engrave) {
      engraveOver(t, fade.start !== null);
      return;
    }
    ctx.globalAlpha = 1 - t;
    if (fade.view && fade.view.mapId === state.map.id) {
      const z = state.scale / fade.view.scale;
      const x = (fade.view.cx - state.cx) * state.scale * state.ratio + canvas.width / 2 - (fade.canvas.width / 2) * z;
      const y = (fade.view.cy - state.cy) * state.scale * state.ratio + canvas.height / 2 - (fade.canvas.height / 2) * z;
      ctx.drawImage(fade.canvas, x, y, fade.canvas.width * z, fade.canvas.height * z);
    } else ctx.drawImage(fade.canvas, 0, 0);
    ctx.globalAlpha = 1;
  }

  function snapshot(duration) {
    if (!canvas.width || !canvas.height) return;
    if (fade) fade.canvas.width = 0;
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d').drawImage(canvas, 0, 0);
    fade = {
      canvas: copy,
      start: null,
      duration: reducedMotion.matches ? 1 : duration,
      engrave: false,
      view: { mapId: state.map.id, cx: state.cx, cy: state.cy, scale: state.scale }
    };
  }

  /* Entrances: the plotter draws the map, the laser engraves it, and the
     printer builds it up, each the way the real machine would. */

  function reveal(faded) {
    const style = STYLES[state.styleId];
    if (style.plot) startPlot(faded);
    else if (style.laser) startEngrave(faded);
    else if (style.model) startBuild(faded);
    else if (!faded) snapshot(260);
    redraw();
  }

  // Ends any entrance at once, for when the map is moved.
  function finishReveal() {
    if (plot) finishPlot();
    if (build) finishBuild();
    if (fade && fade.engrave) {
      fade.engrave = false;
      fade.start = performance.now();
      fade.duration = 150;
    }
  }

  /* Pen plotter */

  // `faded` is set when the caller already took the picture to fade from.
  function startPlot(faded) {
    const map = state.map;
    const style = STYLES[state.styleId];
    const box = viewBox();
    const strokes = [];
    let total = 0;
    for (const p of style.pens) {
      for (const name of p.layers) {
        const layer = map.layers[name];
        for (const chunk of layer.chunks) {
          if (!hits(chunk.box, box)) continue;
          for (let f = chunk.start; f < chunk.end; f++) {
            const feature = layer.features[f];
            if (!hits(feature.box, box)) continue;
            const lines = layer.fill ? outlinesOf(map, feature) : feature.parts;
            for (const line of lines) {
              let length = 0;
              for (let k = 2; k < line.length; k += 2) length += Math.hypot(line[k] - line[k - 2], line[k + 1] - line[k - 1]);
              strokes.push({ line: line, pen: p, at: total });
              total += length;
            }
          }
        }
      }
    }
    const surface = document.createElement('canvas');
    surface.width = canvas.width;
    surface.height = canvas.height;
    const c = surface.getContext('2d');
    const k = state.scale * state.ratio;
    c.setTransform(k, 0, 0, k, canvas.width / 2 - state.cx * k, canvas.height / 2 - state.cy * k);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    plot = {
      canvas: surface,
      c: c,
      strokes: strokes,
      total: total,
      index: 0,
      k: 0,
      x: 0,
      y: 0,
      along: 0,
      started: null,
      duration: reducedMotion.matches ? 0 : Math.min(4000, 2500 + strokes.length / 12)
    };
    if (!faded) snapshot(350);
    if (fade) fade.start = performance.now();
  }

  function plotStep(now) {
    if (plot.started === null) plot.started = now;
    const t = plot.duration ? Math.min(1, (now - plot.started) / plot.duration) : 1;
    // Eases out, the way a plotter slows down for the last few short lines.
    const target = t >= 1 ? Infinity : plot.total * (1 - Math.pow(1 - t, 1.6));
    const c = plot.c;
    let current = null;
    while (plot.index < plot.strokes.length) {
      const s = plot.strokes[plot.index];
      if (s.at >= target) break;
      if (s.pen !== current) {
        if (current) c.stroke();
        current = s.pen;
        c.strokeStyle = current.color;
        c.lineWidth = penWidth(current);
        c.beginPath();
      }
      const line = s.line;
      if (plot.k === 0) {
        plot.x = line[0];
        plot.y = line[1];
        plot.along = s.at;
        plot.k = 2;
      }
      c.moveTo(plot.x, plot.y);
      while (plot.k < line.length) {
        const x = line[plot.k];
        const y = line[plot.k + 1];
        const seg = Math.hypot(x - plot.x, y - plot.y);
        if (plot.along + seg > target) {
          const f = seg ? (target - plot.along) / seg : 0;
          plot.x += (x - plot.x) * f;
          plot.y += (y - plot.y) * f;
          plot.along = target;
          c.lineTo(plot.x, plot.y);
          break;
        }
        c.lineTo(x, y);
        plot.x = x;
        plot.y = y;
        plot.along += seg;
        plot.k += 2;
      }
      if (plot.k < line.length) break;
      plot.index++;
      plot.k = 0;
    }
    if (current) c.stroke();

    if (t >= 1) {
      finishPlot();
      return false;
    }
    if (penTip && plot.index < plot.strokes.length) {
      const x = (plot.x - state.cx) * state.scale + state.width / 2;
      const y = (plot.y - state.cy) * state.scale + state.height / 2;
      penTip.hidden = false;
      penTip.style.transform = 'translate(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px)';
    }
    return true;
  }

  function penWidth(p) {
    return Math.max(p.width * Math.pow(state.scale / state.map.scale, 0.45) / state.scale, 1 / (state.scale * state.ratio));
  }

  // The drawing so far stays on top until the tiles are ready.
  function finishPlot() {
    if (!plot) return;
    handOff(plot.canvas);
    plot = null;
    if (penTip) penTip.hidden = true;
  }

  function handOff(surface) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = STYLES[state.styleId].paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(surface, 0, 0);
    surface.width = 0;
    snapshot(150);
    redraw();
  }

  /* Laser: the new map is burned in a row at a time, back and forth, over
     the old one. */

  const ENGRAVE_ROW = 7;

  function startEngrave(faded) {
    if (!faded) snapshot(0);
    if (!fade) return;
    fade.engrave = true;
    fade.duration = reducedMotion.matches ? 1 : 2600;
  }

  function engraveOver(t, burning) {
    const W = canvas.width;
    const H = canvas.height;
    const row = Math.max(1, Math.round(ENGRAVE_ROW * state.ratio));
    const rows = Math.ceil(H / row);
    const p = t * rows;
    const r = Math.floor(p);
    const y = r * row;
    const forward = r % 2 === 0;
    const x = forward ? (p - r) * W : (1 - (p - r)) * W;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y + row, W, H - y - row);
    if (forward) ctx.rect(x, y, W - x, row);
    else ctx.rect(0, y, x, row);
    ctx.clip();
    ctx.drawImage(fade.canvas, 0, 0);
    ctx.restore();
    if (!burning) return;

    const cy = y + row / 2;
    const glow = 14 * state.ratio;
    const trail = ctx.createLinearGradient(x, 0, forward ? x - 60 * state.ratio : x + 60 * state.ratio, 0);
    trail.addColorStop(0, 'rgba(255, 150, 60, 0.75)');
    trail.addColorStop(1, 'rgba(255, 110, 30, 0)');
    ctx.fillStyle = trail;
    ctx.fillRect(forward ? x - 60 * state.ratio : x, cy - state.ratio, 60 * state.ratio, 2 * state.ratio);
    const spot = ctx.createRadialGradient(x, cy, 0, x, cy, glow);
    spot.addColorStop(0, 'rgba(255, 255, 235, 1)');
    spot.addColorStop(0.18, 'rgba(255, 200, 110, 0.9)');
    spot.addColorStop(0.5, 'rgba(255, 120, 30, 0.3)');
    spot.addColorStop(1, 'rgba(255, 100, 20, 0)');
    ctx.fillStyle = spot;
    ctx.fillRect(x - glow, cy - glow, glow * 2, glow * 2);
  }

  /* 3D printer: the buildings go up a layer at a time. The ground is drawn
     once, and the buildings again for each layer. */

  function startBuild(faded) {
    if (!canvas.width || !canvas.height) return;
    const map = state.map;
    const style = STYLES[state.styleId];
    const W = canvas.width;
    const H = canvas.height;
    const k = state.scale * state.ratio;
    const ground = document.createElement('canvas');
    ground.width = W;
    ground.height = H;
    const g = ground.getContext('2d', { alpha: false });
    g.fillStyle = style.paper;
    g.fillRect(0, 0, W, H);
    g.setTransform(k, 0, 0, k, W / 2 - state.cx * k, H / 2 - state.cy * k);
    drawGround(g, map, style, state.scale, state.ratio, viewBox());
    const surface = document.createElement('canvas');
    surface.width = W;
    surface.height = H;
    build = {
      ground: ground,
      canvas: surface,
      c: surface.getContext('2d', { alpha: false }),
      layer: -1,
      started: null,
      duration: reducedMotion.matches ? 0 : 2200
    };
    if (!faded) snapshot(300);
    if (fade) fade.start = performance.now();
  }

  function buildStep(now) {
    if (build.started === null) build.started = now;
    const t = build.duration ? Math.min(1, (now - build.started) / build.duration) : 1;
    const layer = Math.ceil((1 - Math.pow(1 - t, 1.5)) * LAYERS);
    if (layer !== build.layer) {
      build.layer = layer;
      const c = build.c;
      const k = state.scale * state.ratio;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(build.ground, 0, 0);
      c.setTransform(k, 0, 0, k, canvas.width / 2 - state.cx * k, canvas.height / 2 - state.cy * k);
      drawBuildings(c, state.map, STYLES[state.styleId], state.scale, state.ratio, viewBox(), layer / LAYERS);
    }
    if (t >= 1) {
      finishBuild();
      return false;
    }
    return true;
  }

  function finishBuild() {
    if (!build) return;
    // An unfinished model is drawn whole before it's handed to the tiles.
    if (build.layer < LAYERS) {
      build.layer = LAYERS - 1;
      build.started = -Infinity;
      buildStep(0);
      return;
    }
    build.ground.width = 0;
    handOff(build.canvas);
    build = null;
  }

  /* Scale bar, metric over imperial */

  let lastScaleText = '';

  function niceLength(max) {
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const n = max / p;
    return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * p;
  }

  function updateScale() {
    if (!scaleBar || scaleBar.offsetParent === null) return;
    const metersPerPx = state.map.unit / state.scale;
    const maxPx = 80;
    const meters = niceLength(maxPx * metersPerPx);
    const feetPerPx = metersPerPx * 3.28084;
    let imperial;
    let imperialPx;
    if (maxPx * feetPerPx >= 5280) {
      const miles = niceLength((maxPx * metersPerPx) / 1609.344);
      imperial = miles + ' mi';
      imperialPx = (miles * 1609.344) / metersPerPx;
    } else {
      const feet = niceLength(maxPx * feetPerPx);
      imperial = feet + ' ft';
      imperialPx = feet / feetPerPx;
    }
    const metric = meters >= 1000 ? meters / 1000 + ' km' : meters + ' m';
    const key = metric + imperial + state.scale;
    if (key === lastScaleText) return;
    lastScaleText = key;
    const m = scaleBar.querySelector('.metric');
    const i = scaleBar.querySelector('.imperial');
    m.textContent = metric;
    i.textContent = imperial;
    m.style.width = Math.round(meters / metersPerPx) + 'px';
    i.style.width = Math.round(imperialPx) + 'px';
  }

  /* Title block, in the style's own colors like a print's */

  function updateTitle() {
    if (!title || !state.map) return;
    const style = STYLES[state.styleId];
    title.querySelector('.name').textContent = state.map.name;
    title.style.setProperty('--ink', style.ink || style.roads);
    title.style.setProperty('--paper', style.paper);
    showCoords(null);
  }

  // The center of the city, or the point under the pointer.
  function showCoords(p) {
    if (!title || !state.map) return;
    const ll = p
      ? lonLatAt(state.map, state.cx + (p.x - state.width / 2) / state.scale, state.cy + (p.y - state.height / 2) / state.scale)
      : [state.map.lon, state.map.lat];
    title.querySelector('.coords').textContent = formatLonLat(ll[0], ll[1]);
  }

  /* Size */

  // The device pixel size, where the browser gives it, makes the canvas map
  // one to one onto the screen. It is checked against the ratio, since some
  // emulated screens report CSS pixels there.
  function resize(width, height, deviceWidth, deviceHeight) {
    const ratio = window.devicePixelRatio || 1;
    width = Math.max(1, width);
    height = Math.max(1, height);
    const exact = deviceWidth && Math.abs(deviceWidth - width * ratio) < 2 && Math.abs(deviceHeight - height * ratio) < 2;
    const w = exact ? deviceWidth : Math.round(width * ratio);
    const h = exact ? deviceHeight : Math.round(height * ratio);
    if (w === canvas.width && h === canvas.height && ratio === state.ratio) return;
    const wasHome = state.map && Math.abs(state.scale - homeScale(state.map)) < 1e-9;
    if (state.map) finishReveal();
    canvas.width = w;
    canvas.height = h;
    state.width = width;
    state.height = height;
    if (ratio !== state.ratio) {
      state.ratio = ratio;
      clearTiles();
    }
    maxTiles = Math.max(24, Math.ceil((w / TILE + 2) * (h / TILE + 2) * 2.5));
    if (!state.map) return;
    // The picture to fade from no longer fits.
    if (fade) {
      fade.canvas.width = 0;
      fade = null;
    }
    if (!state.placed) resetView();
    else if (wasHome) state.scale = homeScale(state.map);
    clampView();
    state.tileScale = state.scale;
    state.oldScale = null;
    frame(performance.now());
  }

  function measure() {
    const rect = canvas.getBoundingClientRect();
    resize(rect.width, rect.height);
  }

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(function (entries) {
      const entry = entries[entries.length - 1];
      const box = entry.devicePixelContentBoxSize && entry.devicePixelContentBoxSize[0];
      resize(entry.contentRect.width, entry.contentRect.height, box && box.inlineSize, box && box.blockSize);
    });
    try {
      observer.observe(canvas, { box: 'device-pixel-content-box' });
    } catch (error) {
      observer.observe(canvas);
    }
  } else {
    window.addEventListener('resize', measure);
    measure();
  }

  // Moving the window to a screen with another pixel ratio doesn't resize anything.
  function watchRatio() {
    const query = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    const changed = function () {
      if (query.removeEventListener) query.removeEventListener('change', changed);
      measure();
      watchRatio();
    };
    if (query.addEventListener) query.addEventListener('change', changed);
  }
  watchRatio();

  /* Moving the map */

  function stopMotion() {
    motion = null;
  }

  // Anything that moves the map or changes it by hand ends the tour.
  function takeOver() {
    finishReveal();
    stopMotion();
    stopTour();
  }

  function panBy(dx, dy) {
    state.cx -= dx / state.scale;
    state.cy -= dy / state.scale;
    clampView();
  }

  // Keeps the point under (x, y) in place while the scale changes.
  function zoomAround(scale, x, y) {
    const ux = state.cx + (x - state.width / 2) / state.scale;
    const uy = state.cy + (y - state.height / 2) / state.scale;
    state.scale = Math.min(Math.max(scale, minScale()), Math.max(maxScale(), minScale()));
    state.cx = ux - (x - state.width / 2) / state.scale;
    state.cy = uy - (y - state.height / 2) / state.scale;
    clampView();
  }

  function animateZoom(factor, x, y) {
    if (!state.map) return;
    takeOver();
    if (x === undefined) {
      x = state.width / 2;
      y = state.height / 2;
    }
    const from = state.scale;
    const to = Math.min(Math.max(from * factor, minScale()), Math.max(maxScale(), minScale()));
    if (Math.abs(to - from) < 1e-9) return;
    if (reducedMotion.matches) {
      zoomAround(to, x, y);
      settle();
      return;
    }
    const start = performance.now();
    motion = function (now) {
      const t = Math.min(1, (now - start) / 260);
      const e = 1 - Math.pow(1 - t, 3);
      zoomAround(from * Math.pow(to / from, e), x, y);
      if (t >= 1) {
        motion = null;
        settle();
        return false;
      }
      return true;
    };
    redraw();
  }

  function engage() {
    if (engaged) return;
    engaged = true;
    redraw();
  }

  canvas.addEventListener('pointerenter', engage);
  canvas.addEventListener('focus', engage);

  function local(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // A press alone doesn't end the tour, since on a phone it may be the start
  // of scrolling the page. Moving the map does.
  canvas.addEventListener('pointerdown', function (event) {
    if (!state.map || (event.pointerType === 'mouse' && event.button !== 0)) return;
    stopMotion();
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, local(event));
    if (pointers.size === 1) {
      const p = local(event);
      drag = { x: p.x, y: p.y, x0: p.x, y0: p.y, moved: false, moves: [{ x: p.x, y: p.y, t: event.timeStamp }] };
      canvas.classList.add('dragging');
    } else if (pointers.size === 2) {
      takeOver();
      drag = null;
      const [a, b] = Array.from(pointers.values());
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: state.scale, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  });

  canvas.addEventListener('pointermove', function (event) {
    const p = local(event);
    if (event.pointerType === 'mouse') showCoords(p);
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = Array.from(pointers.values());
      const x = (a.x + b.x) / 2;
      const y = (a.y + b.y) / 2;
      panBy(x - pinch.x, y - pinch.y);
      zoomAround(pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance, x, y);
      pinch.x = x;
      pinch.y = y;
      redraw();
    } else if (drag) {
      if (!drag.moved) {
        if (Math.hypot(p.x - drag.x0, p.y - drag.y0) < 4) return;
        drag.moved = true;
        takeOver();
      }
      panBy(p.x - drag.x, p.y - drag.y);
      drag.x = p.x;
      drag.y = p.y;
      drag.moves.push({ x: p.x, y: p.y, t: event.timeStamp });
      if (drag.moves.length > 6) drag.moves.shift();
      redraw();
    }
  });

  canvas.addEventListener('pointerleave', function (event) {
    if (event.pointerType === 'mouse') showCoords(null);
  });

  function release(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pinch) {
      if (pointers.size < 2) {
        pinch = null;
        drag = null;
        canvas.classList.remove('dragging');
        settle();
      }
      return;
    }
    if (drag) {
      canvas.classList.remove('dragging');
      const moves = drag.moves;
      const moved = drag.moved;
      drag = null;
      if (!moved || event.type === 'pointercancel' || reducedMotion.matches || moves.length < 2) return;
      const a = moves[0];
      const b = moves[moves.length - 1];
      const dt = b.t - a.t;
      if (dt <= 0 || event.timeStamp - b.t > 80) return;
      let vx = (b.x - a.x) / dt;
      let vy = (b.y - a.y) / dt;
      if (Math.hypot(vx, vy) < 0.25) return;
      let last = performance.now();
      motion = function (now) {
        const step = Math.min(40, now - last);
        last = now;
        panBy(vx * step, vy * step);
        const decay = Math.exp(-step / 280);
        vx *= decay;
        vy *= decay;
        if (Math.hypot(vx, vy) < 0.02) {
          motion = null;
          return false;
        }
        return true;
      };
      redraw();
    }
  }

  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', function (event) {
    canvas.classList.remove('dragging');
    release(event);
  });

  canvas.addEventListener('dblclick', function (event) {
    const p = local(event);
    animateZoom(event.shiftKey ? 0.5 : 2, p.x, p.y);
  });

  // Plain scrolling scrolls the page. Ctrl or Cmd with the wheel zooms, and
  // that's also what a trackpad pinch sends.
  let wheelTimer = 0;
  canvas.addEventListener('wheel', function (event) {
    if (!state.map || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    takeOver();
    const p = local(event);
    const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
    zoomAround(state.scale * Math.pow(2, -Math.max(-100, Math.min(100, delta)) / 100), p.x, p.y);
    redraw();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(settle, 180);
  }, { passive: false });

  canvas.addEventListener('keydown', function (event) {
    if (!state.map || event.altKey || event.ctrlKey || event.metaKey) return;
    const move = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[event.key];
    if (move) {
      takeOver();
      panBy(move[0], move[1]);
      redraw();
    } else if (event.key === '+' || event.key === '=') animateZoom(2);
    else if (event.key === '-' || event.key === '_') animateZoom(0.5);
    else if (event.key === '0' || event.key === 'Home') goHome();
    else return;
    event.preventDefault();
  });

  cover.querySelectorAll('[data-zoom]').forEach(function (button) {
    button.addEventListener('click', function () {
      const how = button.dataset.zoom;
      if (how === 'in') animateZoom(2);
      else if (how === 'out') animateZoom(0.5);
      else goHome();
    });
  });

  // This also plays the style's entrance again.
  function goHome() {
    if (!state.map) return;
    takeOver();
    snapshot(200);
    resetView();
    reveal(true);
  }

  /* City and style */

  function showStatus(text) {
    if (!status) return;
    status.textContent = text;
    status.hidden = !text;
  }

  function setStyle(id) {
    if (!STYLES[id] || id === state.styleId) return;
    finishReveal();
    stopMotion();
    if (styleSelect.value !== id) styleSelect.value = id;
    state.styleId = id;
    if (!state.map) return;
    updateTitle();
    reveal(false);
  }

  let wanted = null;

  // `styleId` changes the style along with the city, in one transition.
  function setCity(id, styleId) {
    wanted = id;
    const slow = setTimeout(function () {
      if (state.map) showStatus('Loading...');
    }, 250);
    return load(id).then(function (map) {
      clearTimeout(slow);
      if (wanted !== id) return;
      showStatus('');
      finishReveal();
      stopMotion();
      const first = !state.map;
      const next = STYLES[styleId] || STYLES[state.styleId];
      // Slower between tour plates, unless an entrance follows.
      if (!first) snapshot(styleId && !next.plot && !next.model ? 700 : 320);
      state.map = map;
      if (styleId && STYLES[styleId]) state.styleId = styleId;
      citySelect.value = id;
      styleSelect.value = state.styleId;
      clearTiles();
      canvas.setAttribute('aria-label', 'Map of ' + map.about);
      updateTitle();
      if (state.width) resetView();
      if (first) {
        cover.classList.add('map-ready');
        frame(performance.now());
      } else reveal(true);
    }).catch(function () {
      clearTimeout(slow);
      if (wanted !== id || !state.map) return;
      // The tour goes on from the map still showing.
      wanted = state.map.id;
      showStatus('The map could not be loaded.');
      citySelect.value = state.map.id;
    });
  }

  citySelect.addEventListener('change', function () {
    stopTour();
    setCity(citySelect.value);
  });

  styleSelect.addEventListener('change', function () {
    stopTour();
    state.picked = true;
    setStyle(styleSelect.value);
  });

  function schemeStyle() {
    return darkScheme.matches ? 'midnight' : 'classic';
  }

  const followScheme = function () {
    if (!state.picked && (state.styleId === 'classic' || state.styleId === 'midnight')) setStyle(schemeStyle());
  };
  if (darkScheme.addEventListener) darkScheme.addEventListener('change', followScheme);

  /* Tour. It waits while keyboard focus is on the map, while the map is off
     screen, and until each entrance is done. Hovering doesn't hold it, since
     the pointer often rests on the banner when the page loads. */

  const tour = { on: false, opening: true, at: 0, shown: 0, rest: 0, fetched: -1, last: 0, timer: 0, holds: new Set() };

  function plateStyle(plate) {
    return (darkScheme.matches && plate.dark) || plate.style || schemeStyle();
  }

  function plateKind(plate) {
    const style = STYLES[plate.style] || {};
    return style.model ? 'model' : style.plot ? 'plotter' : style.laser ? 'laser' : 'print';
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = list[i];
      list[i] = list[j];
      list[j] = swap;
    }
    return list;
  }

  // After the opening, each machine plate follows a print plate, so the
  // entrances are spread out. The same style never shows twice in a row,
  // including from the last plate back to the first.
  function shuffleTour() {
    const kinds = { model: [], plotter: [], laser: [], print: [] };
    TOUR.slice(1).forEach(function (plate) {
      kinds[plateKind(plate)].push(plate);
    });
    const opening = [];
    OPENING.forEach(function (want) {
      // Not the opening map's style again, as a print plate's dark style could be.
      const leads = [].concat(kinds.model, kinds.plotter, kinds.laser, kinds.print).filter(function (plate) {
        return plate.lead && (plateKind(plate) === want || plate.style === want) && plateStyle(plate) !== plateStyle(TOUR[0]);
      });
      if (!leads.length) return;
      const pick = leads[Math.floor(Math.random() * leads.length)];
      const kind = kinds[plateKind(pick)];
      kind.splice(kind.indexOf(pick), 1);
      opening.push(pick);
    });
    const machines = kinds.model.concat(kinds.plotter, kinds.laser);
    const prints = kinds.print;
    for (let attempt = 0; attempt < 2000; attempt++) {
      shuffle(machines);
      shuffle(prints);
      const after = shuffle(prints.map(function (plate, i) {
        return i;
      })).slice(0, machines.length).sort(function (a, b) {
        return a - b;
      });
      const rest = [];
      let m = 0;
      prints.forEach(function (plate, i) {
        rest.push(plate);
        if (after[m] === i) rest.push(machines[m++]);
      });
      while (m < machines.length) rest.push(machines[m++]);
      const order = [TOUR[0]].concat(opening, rest);
      if (order.every(function (plate, i) {
        return plateStyle(plate) !== plateStyle(order[(i + 1) % order.length]);
      }) || attempt === 1999) {
        TOUR.splice(0, TOUR.length, ...order);
        return;
      }
    }
  }

  function setTourButton() {
    if (!tourButton) return;
    const label = tour.on ? 'Pause tour' : 'Play tour';
    tourButton.title = label;
    tourButton.setAttribute('aria-label', label);
    tourButton.classList.toggle('playing', tour.on);
  }

  function startTour() {
    if (tour.on) return;
    tour.on = true;
    tour.shown = 0;
    tour.last = performance.now();
    tour.timer = setInterval(tourTick, 200);
    setTourButton();
  }

  function stopTour() {
    if (!tour.on) return;
    tour.on = false;
    clearInterval(tour.timer);
    setTourButton();
  }

  function tourTick() {
    const now = performance.now();
    const elapsed = now - tour.last;
    tour.last = now;
    if (tour.holds.size || !state.map || wanted !== state.map.id || pointers.size) return;
    tour.shown += elapsed;
    if (plot || build || fade || motion) {
      tour.rest = 0;
      return;
    }
    tour.rest += elapsed;
    // Fetched while nothing is moving, since decoding a city or making a
    // material's texture can stall an entrance. The plate after next is
    // fetched too, so each city has a whole plate to arrive.
    if (tour.fetched !== tour.at) {
      tour.fetched = tour.at;
      const style = STYLES[plateStyle(TOUR[(tour.at + 1) % TOUR.length])];
      if (style.grain) texture(style.grain);
      if (style.frost) texture(style.frost);
      const after = TOUR[(tour.at + 2) % TOUR.length].city;
      load(TOUR[(tour.at + 1) % TOUR.length].city).then(function () {
        if (tour.on) load(after);
      }, function () {});
    }
    if (tour.opening ? tour.shown >= PLATE / 3 : tour.shown >= PLATE && tour.rest >= REST) nextPlate();
  }

  function nextPlate() {
    tour.opening = false;
    tour.at = (tour.at + 1) % TOUR.length;
    tour.shown = 0;
    tour.rest = 0;
    const plate = TOUR[tour.at];
    setCity(plate.city, plateStyle(plate));
  }

  function hold(reason, on) {
    if (on) tour.holds.add(reason);
    else tour.holds.delete(reason);
  }

  if (tourButton) {
    tourButton.addEventListener('click', function () {
      if (tour.on) {
        stopTour();
        return;
      }
      startTour();
      nextPlate();
    });
  }

  // Only keyboard focus. A clicked button keeps focus after the pointer leaves.
  cover.addEventListener('focusin', function (event) {
    let keyboard = true;
    try {
      keyboard = event.target.matches(':focus-visible');
    } catch (error) {
      // Older browsers hold on any focus.
    }
    hold('focus', keyboard);
  });
  cover.addEventListener('focusout', function (event) {
    if (!cover.contains(event.relatedTarget)) hold('focus', false);
  });
  document.addEventListener('visibilitychange', function () {
    hold('hidden', document.hidden);
  });
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      hold('away', entries[entries.length - 1].intersectionRatio < 0.4);
    }, { threshold: [0, 0.4] }).observe(cover);
  }

  // Browsers can restore a select's value on reload.
  citySelect.value = (citySelect.querySelector('option[selected]') || citySelect.options[0]).value;
  state.styleId = schemeStyle();
  styleSelect.value = state.styleId;
  setTourButton();
  setCity(citySelect.value);
  const saveData = navigator.connection && navigator.connection.saveData;
  shuffleTour();
  if (!reducedMotion.matches && !saveData) startTour();
})();
