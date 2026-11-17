// Renders the app icon as PNG without any dependency.
//
// iOS will not use an SVG for apple-touch-icon, and the manifest wants real PNGs,
// so the mark is drawn straight into an RGBA buffer and encoded by hand: the app
// already uses a ring-and-dot glyph (◉) on the reveal card, and that is the icon.

import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const mix = (a, b, t) => a + (b - a) * t;

/** The palette of src/styles.css: deep violet ground, accent ring, gold core. */
function sample(x, y, size) {
  const half = size / 2;
  const dx = (x - half) / half;
  const dy = (y - half) / half;
  const distance = Math.hypot(dx, dy);

  // Radial haze from the top-left, like the app background.
  const glow = clamp01(1 - Math.hypot(dx + 0.45, dy + 0.6) / 1.5);
  let r = mix(11, 74, glow * 0.85);
  let g = mix(10, 48, glow * 0.85);
  let b = mix(16, 118, glow * 0.85);

  const ring = Math.abs(distance - 0.58) < 0.075;
  const core = distance < 0.19;

  if (ring) [r, g, b] = [183, 162, 255];
  if (core) [r, g, b] = [255, 212, 121];
  return [r, g, b];
}

export function iconPng(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  const samples = 3;

  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const [sr, sg, sb] = sample(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples, size);
          r += sr;
          g += sg;
          b += sb;
        }
      }
      const count = samples * samples;
      const offset = y * stride + 1 + x * 4;
      raw[offset] = Math.round(r / count);
      raw[offset + 1] = Math.round(g / count);
      raw[offset + 2] = Math.round(b / count);
      raw[offset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Width and height from a PNG's IHDR, for tests that check the real file. */
export function pngSize(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
