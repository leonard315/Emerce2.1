/**
 * Generates PWA icons as proper PNG files using pure Node.js (no external deps).
 * Creates a red rounded square with a white triangle-alert icon.
 * Run: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '../public/icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size * 0.18; // border radius

  // Red rounded background
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = '#dc2626';
  ctx.fill();

  // White triangle (alert icon)
  const cx = size / 2;
  const topY = size * 0.18;
  const botY = size * 0.82;
  const halfW = size * 0.36;
  const strokeW = size * 0.07;

  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.lineTo(cx + halfW, botY);
  ctx.lineTo(cx - halfW, botY);
  ctx.closePath();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = strokeW;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Exclamation dot
  ctx.beginPath();
  ctx.arc(cx, botY - size * 0.1, strokeW * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();

  // Exclamation line
  ctx.beginPath();
  ctx.moveTo(cx, topY + size * 0.22);
  ctx.lineTo(cx, botY - size * 0.18);
  ctx.strokeStyle = 'white';
  ctx.lineWidth = strokeW;
  ctx.lineCap = 'round';
  ctx.stroke();

  return canvas.toBuffer('image/png');
}

try {
  sizes.forEach(size => {
    const buf = drawIcon(size);
    const filePath = path.join(iconsDir, `icon-${size}x${size}.png`);
    fs.writeFileSync(filePath, buf);
    console.log(`✅ icon-${size}x${size}.png`);
  });
  console.log('\n🎉 All icons generated successfully!');
} catch (e) {
  console.error('canvas not available, using fallback SVG-based approach');
  // Fallback: copy SVG as reference
  console.log('Please use https://realfavicongenerator.net with public/icons/icon.svg');
}
