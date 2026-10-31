(function () {
  'use strict';

  const cover = document.querySelector('.cover[data-map]');
  if (!cover || !window.Path2D || !window.fetch || !window.requestAnimationFrame) return;

  const root = new URL('../../', document.currentScript.src);
  const canvas = cover.querySelector('.map-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const citySelect = document.getElementById('map-city');
  const styleSelect = document.getElementById('map-style');
  const status = cover.querySelector('.map-status');
  const scaleBar = cover.querySelector('.map-scale');
  const penTip = cover.querySelector('.map-pen');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

  // The banner on a wide screen, which the starting zoom is set for.
  const DESIGN_WIDTH = 978;
  const DESIGN_HEIGHT = 248;
  const MAX_ZOOM = 4;
  const TILE = 512;

  /* Styles. The print themes are SVGmap's. */

  const STYLES = {
    classic: { paper: '#F5F0E6', greens: '#CADDB4', water: '#A7C7E0', buildings: '#C9BDAE', roads: '#3A3A3A', paths: '#8A8A8A', rail: '#8C6E5B' },
    minimal: { paper: '#FFFFFF', greens: '#E7EEE0', water: '#DCE7EF', buildings: '#D2D2D2', roads: '#141414', paths: '#7A7A7A', rail: '#141414' },
    blueprint: { paper: '#173A5E', greens: '#1E4468', water: '#244E78', buildings: '#2F5B86', roads: '#EAF2FB', paths: '#9DB7D1', rail: '#EAF2FB' },
    noir: { paper: '#101010', greens: '#1B1B1B', water: '#262626', buildings: '#363636', roads: '#F2F2F2', paths: '#8F8F8F', rail: '#F2F2F2' },
    terracotta: { paper: '#F4E6D6', greens: '#D9D3B2', water: '#BFD3D6', buildings: '#DE9A7D', roads: '#5A3528', paths: '#A0776A', rail: '#5A3528' },
    riso: { paper: '#F3EEE4', greens: '#C4B8D3', water: '#86B9D3', buildings: '#F7BCD4', roads: '#0078BF', paths: '#6DADD0', rail: '#FD61B8', waterways: '#499BCA' },
    midnight: { paper: '#14233D', greens: '#192C46', water: '#091220', buildings: '#22395B', roads: '#D4AF6A', paths: '#8E7A55', rail: '#A8916A' },
    nolli: { paper: '#F7F5F0', greens: '#E3E6DA', water: '#C9D3DA', buildings: '#1C1C1C', roads: '#B5B5B5', paths: '#CFCFCF', rail: '#9A9A9A' },
    // Outlines only, one pen per color, in the order a plotter would draw them.
    plotter: {
      paper: '#FBFAF6',
      plot: true,
      pens: [
        { layers: ['greens'], color: '#4E8A4A', width: 0.5 },
        { layers: ['shore', 'waterways'], color: '#2D6DA8', width: 0.6 },
        { layers: ['buildings'], color: '#A4876C', width: 0.4 },
        { layers: ['rail'], color: '#B5482F', width: 0.7 },
        { layers: ['paths', 'service', 'streets', 'major'], color: '#24272B', width: 0.7 }
      ]
    },
    // Engraved and scored into birch plywood. The colors multiply the wood,
    // so the grain shows through the burn.
    laser: { paper: '#E9D3AF', laser: true, greens: '#EDE3D2', water: '#7E5E44', buildings: '#D2B898', roads: '#5A3B26', paths: '#8E6E52', rail: '#6E4C34' }
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

  /* Data */

  const DIGITS = new Uint8Array(128);
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('').forEach(function (c, i) {
    DIGITS[c.charCodeAt(0)] = i;
  });
  const CHUNK = 160;

  function decodeLayer(layer) {
    const text = layer.data;
    const fill = layer.type === 'fill';
    let pos = 0;
    let x = 0;
    let y = 0;

    function read() {
      let n = 0;
      let scale = 1;
      let c;
      do {
        c = DIGITS[text.charCodeAt(pos++)];
        n += (c & 31) * scale;
        scale *= 32;
      } while (c & 32);
      return n;
    }

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

  function prepare(json) {
    const layers = {};
    Object.keys(json.layers).forEach(function (name) {
      layers[name] = decodeLayer(json.layers[name]);
    });
    json.layers = layers;
    return json;
  }

  const loads = {};

  function load(id) {
    if (!loads[id]) {
      loads[id] = fetch(new URL('assets/maps/' + id + '.json', root))
        .then(function (response) {
          if (!response.ok) throw new Error(String(response.status));
          return response.json();
        })
        .then(function (json) {
          json.id = id;
          return prepare(json);
        });
      loads[id].catch(function () {
        delete loads[id];
      });
    }
    return loads[id];
  }

  // Fills were cut along the tile grid and the edges of the area. Those edges
  // aren't part of the outline, so the plotter leaves them out.
  function outlinesOf(map, feature) {
    const grid = map.grid;
    const margin = map.margin;
    const b = map.bounds;
    function cut(v, axis) {
      return v === b[axis] || v === b[axis + 2] || (v + margin) % grid === 0 || (v - margin) % grid === 0;
    }
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

    if (style.laser) {
      c.fillStyle = woodPattern(map, scale);
      c.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
      c.globalCompositeOperation = 'multiply';
    }
    fillLayer(c, map.layers.greens, style.greens, box);
    fillLayer(c, map.layers.water, style.water, box);
    strokeLayer(c, map.layers.waterways, style.waterways || style.water, Math.max(0.9 * px, unit), reach);
    fillLayer(c, map.layers.buildings, style.buildings, box);
    for (const line of LINES) {
      if (line.layer === 'waterways') continue;
      strokeLayer(c, map.layers[line.layer], style[line.color], Math.max(line.width * px, unit * 0.8), reach);
    }
    c.globalCompositeOperation = 'source-over';
  }

  /* Birch grain: rings warped by noise that repeats every 512 pixels, so the
     texture tiles. It is laid out in map units, so it lines up across tiles
     and moves with the map. */

  let wood = null;

  function woodTexture() {
    if (wood) return wood;
    const size = 512;
    let seed = 7;
    function random() {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    }
    function lattice(n) {
      const v = new Float32Array(n * n);
      for (let i = 0; i < v.length; i++) v[i] = random();
      return function (x, y) {
        const fx = (x / size) * n;
        const fy = (y / size) * n;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const at = function (i, j) {
          return v[((j % n) + n) % n * n + ((i % n) + n) % n];
        };
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        return a + (b - a) * sy;
      };
    }
    const broad = lattice(4);
    const fine = lattice(16);
    const speck = lattice(128);
    const canvas2 = document.createElement('canvas');
    canvas2.width = size;
    canvas2.height = size;
    const c = canvas2.getContext('2d');
    const image = c.createImageData(size, size);
    const d = image.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const warp = broad(x, y) * 1.6 + fine(x, y) * 0.35;
        const ring = 0.5 + 0.5 * Math.sin(2 * Math.PI * (y / size * 14 + warp));
        const line = Math.pow(ring, 6);
        const shade = 1 - line * 0.13 - broad(y, x) * 0.05 - speck(x, y) * 0.04;
        const k = 4 * (y * size + x);
        d[k] = 243 * shade;
        d[k + 1] = 224 * shade;
        d[k + 2] = 191 * shade;
        d[k + 3] = 255;
      }
    }
    c.putImageData(image, 0, 0);
    wood = canvas2;
    return wood;
  }

  function woodPattern(map, scale) {
    const pattern = ctx.createPattern(woodTexture(), 'repeat');
    // About 640 CSS pixels to the repeat at the starting zoom, growing slower than the map.
    const css = 640 * Math.pow(scale / map.scale, 0.5);
    const k = css / 512 / scale;
    if (pattern.setTransform && window.DOMMatrix) pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    return pattern;
  }

  // All the chunks in one path, so pieces cut at a tile edge fill without a seam.
  function fillLayer(c, layer, color, box) {
    let path = null;
    for (const chunk of layer.chunks) {
      if (!hits(chunk.box, box)) continue;
      if (!path) path = new Path2D();
      path.addPath(chunk.path);
    }
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

    const missing = plot ? [] : neededTiles(state.tileScale, 0);
    renderSome(missing, 10);
    const complete = missing.every(function (t) { return t.done; });
    if (!complete) busy = true;
    else state.oldScale = null;
    // Once the pointer is on the map, the tiles around the view are drawn
    // while it is still, so the first drag doesn't wait for them.
    if (complete && engaged && !plot && !motion && !pointers.size) {
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
    if (plot) {
      ctx.drawImage(plot.canvas, 0, 0);
    } else {
      if (state.oldScale !== null) drawTiles(state.oldScale);
      drawTiles(state.tileScale);
    }
    if (fade) {
      // Holds the old picture until the new tiles are all in, then fades it out.
      if (fade.start === null && (complete || plot)) fade.start = now;
      const alpha = fade.start === null ? 1 : 1 - (now - fade.start) / fade.duration;
      if (alpha <= 0) {
        fade.canvas.width = 0;
        fade = null;
      }
      else {
        ctx.globalAlpha = alpha;
        if (fade.view && fade.view.mapId === state.map.id) {
          const z = state.scale / fade.view.scale;
          const x = (fade.view.cx - state.cx) * state.scale * state.ratio + canvas.width / 2 - (fade.canvas.width / 2) * z;
          const y = (fade.view.cy - state.cy) * state.scale * state.ratio + canvas.height / 2 - (fade.canvas.height / 2) * z;
          ctx.drawImage(fade.canvas, x, y, fade.canvas.width * z, fade.canvas.height * z);
        } else ctx.drawImage(fade.canvas, 0, 0);
        ctx.globalAlpha = 1;
      }
    }
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
      view: { mapId: state.map.id, cx: state.cx, cy: state.cy, scale: state.scale }
    };
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
      duration: reducedMotion.matches ? 0 : Math.min(5000, 2500 + strokes.length / 12)
    };
    if (!faded) snapshot(350);
    if (fade) fade.start = performance.now();
    redraw();
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

  function finishPlot() {
    if (!plot) return;
    // The drawing so far stays on top until the tiles are ready.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = STYLES[state.styleId].paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(plot.canvas, 0, 0);
    plot.canvas.width = 0;
    plot = null;
    if (penTip) penTip.hidden = true;
    snapshot(150);
    redraw();
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
    canvas.width = w;
    canvas.height = h;
    state.width = width;
    state.height = height;
    if (ratio !== state.ratio) {
      state.ratio = ratio;
      clearTiles();
    }
    maxTiles = Math.max(24, Math.ceil((w / TILE + 2) * (h / TILE + 2) * 2.5));
    if (plot) finishPlot();
    if (!state.map) return;
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
    cancelPlot();
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

  function cancelPlot() {
    if (plot) finishPlot();
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

  canvas.addEventListener('pointerdown', function (event) {
    if (!state.map || (event.pointerType === 'mouse' && event.button !== 0)) return;
    cancelPlot();
    stopMotion();
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, local(event));
    if (pointers.size === 1) {
      const p = local(event);
      drag = { x: p.x, y: p.y, moves: [{ x: p.x, y: p.y, t: event.timeStamp }] };
      canvas.classList.add('dragging');
    } else if (pointers.size === 2) {
      drag = null;
      const [a, b] = Array.from(pointers.values());
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: state.scale, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  });

  canvas.addEventListener('pointermove', function (event) {
    if (!pointers.has(event.pointerId)) return;
    const p = local(event);
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
      panBy(p.x - drag.x, p.y - drag.y);
      drag.x = p.x;
      drag.y = p.y;
      drag.moves.push({ x: p.x, y: p.y, t: event.timeStamp });
      if (drag.moves.length > 6) drag.moves.shift();
      redraw();
    }
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
      drag = null;
      if (event.type === 'pointercancel' || reducedMotion.matches || moves.length < 2) return;
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
    cancelPlot();
    stopMotion();
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
      cancelPlot();
      stopMotion();
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

  // In the plotter style this draws the map again.
  function goHome() {
    if (!state.map) return;
    cancelPlot();
    stopMotion();
    snapshot(200);
    resetView();
    if (STYLES[state.styleId].plot) startPlot(true);
  }

  /* City and style */

  function showStatus(text) {
    if (!status) return;
    status.textContent = text;
    status.hidden = !text;
  }

  function setStyle(id) {
    if (!STYLES[id] || id === state.styleId) return;
    cancelPlot();
    stopMotion();
    if (styleSelect.value !== id) styleSelect.value = id;
    state.styleId = id;
    if (!state.map) return;
    if (STYLES[id].plot) startPlot();
    else {
      snapshot(260);
      redraw();
    }
  }

  let wanted = null;

  function setCity(id) {
    wanted = id;
    const slow = setTimeout(function () {
      if (state.map) showStatus('Loading...');
    }, 250);
    return load(id).then(function (map) {
      clearTimeout(slow);
      if (wanted !== id) return;
      showStatus('');
      cancelPlot();
      stopMotion();
      const first = !state.map;
      if (!first) snapshot(320);
      state.map = map;
      clearTiles();
      canvas.setAttribute('aria-label', 'Map of ' + map.about);
      if (state.width) resetView();
      if (first) {
        cover.classList.add('map-ready');
        frame(performance.now());
      }
      if (STYLES[state.styleId].plot && !first) startPlot(true);
    }).catch(function () {
      clearTimeout(slow);
      if (wanted !== id || !state.map) return;
      showStatus('The map could not be loaded.');
      citySelect.value = state.map.id;
    });
  }

  citySelect.addEventListener('change', function () {
    setCity(citySelect.value);
  });

  styleSelect.addEventListener('change', function () {
    state.picked = true;
    setStyle(styleSelect.value);
  });

  function schemeStyle() {
    return darkScheme.matches ? 'midnight' : 'classic';
  }

  const followScheme = function () {
    if (!state.picked) setStyle(schemeStyle());
  };
  if (darkScheme.addEventListener) darkScheme.addEventListener('change', followScheme);

  // Browsers can restore a select's value on reload.
  citySelect.value = (citySelect.querySelector('option[selected]') || citySelect.options[0]).value;
  state.styleId = schemeStyle();
  styleSelect.value = state.styleId;
  setCity(citySelect.value);
})();
