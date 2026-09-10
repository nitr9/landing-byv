// Cuantizador de PNG sin dependencias: decodifica truecolor y reescribe indexado.
// Pensado para arte plano (logos), donde bajar a paleta reduce muchisimo el peso.
const fs = require('fs');
const zlib = require('zlib');

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- Decodificar ----------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('no es un PNG');
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('sin IHDR');
  if (ihdr.depth !== 8) throw new Error('solo soporto profundidad 8, vino ' + ihdr.depth);
  if (ihdr.interlace !== 0) throw new Error('no soporto entrelazado');

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType];
  if (!channels) throw new Error('colorType no soportado: ' + ihdr.colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width, height } = ihdr;
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);

  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error('filtro desconocido: ' + filter);
      }
      cur[i] = v & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}

// ---------- Cuantizar ----------
// Paleta por frecuencia sobre color reducido, luego asignacion al vecino mas cercano.
function buildPalette(pixels, channels, maxColors) {
  const counts = new Map();
  for (let i = 0; i < pixels.length; i += channels) {
    // agrupa en cubos de 8 para juntar variaciones de antialiasing
    const key = ((pixels[i] >> 3) << 10) | ((pixels[i + 1] >> 3) << 5) | (pixels[i + 2] >> 3);
    const e = counts.get(key);
    if (e) { e.n++; e.r += pixels[i]; e.g += pixels[i + 1]; e.b += pixels[i + 2]; }
    else counts.set(key, { n: 1, r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
  }
  return [...counts.values()]
    .sort((x, y) => y.n - x.n)
    .slice(0, maxColors)
    .map(e => [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)]);
}

function nearest(palette, r, g, b) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    // ponderado por sensibilidad del ojo
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ---------- Encodear ----------
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodeIndexed(width, height, indices, palette) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // profundidad
  ihdr[9] = 3;   // colorType indexado
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((p, i) => { plte[i * 3] = p[0]; plte[i * 3 + 1] = p[1]; plte[i * 3 + 2] = p[2]; });

  // scanlines con filtro 0: para arte plano indexado, deflate aprovecha las corridas
  const rawLen = (width + 1) * height;
  const raw = Buffer.alloc(rawLen);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    indices.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- main ----------
const [src, dst, colorsArg] = process.argv.slice(2);
if (!src || !dst) {
  console.error('uso: node quantize.js <entrada.png> <salida.png> [colores]');
  process.exit(1);
}
const maxColors = Math.min(256, parseInt(colorsArg || '64', 10));

const before = fs.statSync(src).size;
const img = decodePng(fs.readFileSync(src));
const palette = buildPalette(img.pixels, img.channels, maxColors);

// cache de asignaciones: el arte plano repite muchisimo el mismo color exacto
const cache = new Map();
const indices = Buffer.alloc(img.width * img.height);
for (let i = 0, j = 0; i < img.pixels.length; i += img.channels, j++) {
  const r = img.pixels[i], g = img.pixels[i + 1], b = img.pixels[i + 2];
  const key = (r << 16) | (g << 8) | b;
  let idx = cache.get(key);
  if (idx === undefined) { idx = nearest(palette, r, g, b); cache.set(key, idx); }
  indices[j] = idx;
}

fs.writeFileSync(dst, encodeIndexed(img.width, img.height, indices, palette));
const after = fs.statSync(dst).size;
const pct = Math.round((1 - after / before) * 100);
console.log(
  `${src.split(/[\\/]/).pop()} -> ${dst.split(/[\\/]/).pop()}  ` +
  `${img.width}x${img.height}  ${palette.length} colores  ` +
  `${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB  (-${pct}%)`
);
