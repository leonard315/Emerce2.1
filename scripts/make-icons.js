/**
 * Pure Node.js PNG icon generator — no external dependencies.
 * Creates proper PWA icons with red background + white triangle alert.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const iconsDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

// ── Minimal PNG encoder ───────────────────────────────────────────────────────
function writePNG(width, height, pixels) {
  // pixels: Uint8Array of RGBA values, row by row
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    const table = [];
    for (let i = 0; i < 256; i++) {
      let v = i;
      for (let j = 0; j < 8; j++) v = (v & 1) ? 0xEDB88320 ^ (v >>> 1) : v >>> 1;
      table[i] = v;
    }
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crcBuf = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcBuf));
    return Buffer.concat([len, t, data, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB (no alpha for simplicity, use RGBA=6)
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // IDAT: filter byte 0 before each row
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter type None
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]);
    }
  }
  const compressed = zlib.deflateSync(Buffer.from(raw));

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ── Draw icon ─────────────────────────────────────────────────────────────────
function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a;
  }

  function fillRect(x0, y0, x1, y1, r, g, b, a) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        setPixel(x, y, r, g, b, a);
  }

  function dist(x, y, cx, cy) { return Math.sqrt((x-cx)**2 + (y-cy)**2); }

  const radius = Math.round(size * 0.18);

  // Fill all pixels: rounded red background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Check if inside rounded rect
      const inCornerTL = x < radius && y < radius && dist(x, y, radius, radius) > radius;
      const inCornerTR = x >= size-radius && y < radius && dist(x, y, size-radius-1, radius) > radius;
      const inCornerBL = x < radius && y >= size-radius && dist(x, y, radius, size-radius-1) > radius;
      const inCornerBR = x >= size-radius && y >= size-radius && dist(x, y, size-radius-1, size-radius-1) > radius;

      if (inCornerTL || inCornerTR || inCornerBL || inCornerBR) {
        setPixel(x, y, 0, 0, 0, 0); // transparent
      } else {
        setPixel(x, y, 220, 38, 38, 255); // red
      }
    }
  }

  // Draw white triangle outline
  const cx = size / 2;
  const topY = Math.round(size * 0.2);
  const botY = Math.round(size * 0.8);
  const halfW = Math.round(size * 0.35);
  const lw = Math.max(2, Math.round(size * 0.055));

  // Draw triangle sides using line drawing
  function drawLine(x0, y0, x1, y1, thick) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx*dx + dy*dy);
    const steps = Math.ceil(len * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = Math.round(x0 + dx * t);
      const py = Math.round(y0 + dy * t);
      for (let ox = -thick; ox <= thick; ox++)
        for (let oy = -thick; oy <= thick; oy++)
          if (ox*ox + oy*oy <= thick*thick)
            setPixel(px+ox, py+oy, 255, 255, 255, 255);
    }
  }

  drawLine(cx, topY, cx + halfW, botY, lw);
  drawLine(cx + halfW, botY, cx - halfW, botY, lw);
  drawLine(cx - halfW, botY, cx, topY, lw);

  // Exclamation mark
  const excTop = Math.round(topY + size * 0.18);
  const excBot = Math.round(botY - size * 0.2);
  drawLine(cx, excTop, cx, excBot, lw);

  // Dot
  const dotY = Math.round(botY - size * 0.1);
  const dotR = Math.round(lw * 1.2);
  for (let ox = -dotR; ox <= dotR; ox++)
    for (let oy = -dotR; oy <= dotR; oy++)
      if (ox*ox + oy*oy <= dotR*dotR)
        setPixel(cx+ox, dotY+oy, 255, 255, 255, 255);

  return writePNG(size, size, pixels);
}

// ── Generate all sizes ────────────────────────────────────────────────────────
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
sizes.forEach(size => {
  const buf = drawIcon(size);
  const file = path.join(iconsDir, `icon-${size}x${size}.png`);
  fs.writeFileSync(file, buf);
  console.log(`✅ icon-${size}x${size}.png (${buf.length} bytes)`);
});
console.log('\n🎉 All PWA icons generated!');
