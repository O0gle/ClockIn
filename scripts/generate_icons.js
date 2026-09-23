const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  }
  table[i] = c;
}

function createPNG(width, height, drawFn) {
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  function makeChunk(type, data) {
    const len = data.length;
    const chunk = Buffer.alloc(8 + len + 4);
    chunk.writeUInt32BE(len, 0);
    chunk.write(type, 4);
    data.copy(chunk, 8);
    const crc = crc32(Buffer.concat([Buffer.from(type), data]));
    chunk.writeUInt32BE(crc, 8 + len);
    return chunk;
  }

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const SIZE = 81; // 微信官方推荐尺寸 81x81
const COLOR_INACTIVE = [140, 144, 153, 255]; // #8c9099
const COLOR_ACTIVE = [22, 119, 255, 255];    // #1677ff

// Helper: distance to line segment
function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

// 1. Clock icon (打卡)
function drawClock(x, y, w, h, color, filled = false) {
  const cx = 40.5, cy = 40.5;
  const d = Math.hypot(x - cx, y - cy);
  const radius = 28;
  const stroke = 4.2;

  const onRing = Math.abs(d - radius) <= stroke / 2;
  const onCenter = d <= 4.5;
  const onHour = distToSegment(x, y, cx, cy, cx, 24) <= 2.8 && y <= cy + 1 && y >= 22;
  const onMin = distToSegment(x, y, cx, cy, cx + 15, cy) <= 2.5 && x >= cx - 1 && x <= cx + 17;

  if (onRing || onCenter || onHour || onMin) {
    return color;
  }
  if (filled && d < radius) {
    return [color[0], color[1], color[2], 25];
  }
  return [0, 0, 0, 0];
}

// 2. Calendar icon (明细)
function drawCalendar(x, y, w, h, color, filled = false) {
  const left = 16, right = 65, top = 20, bottom = 66;
  const stroke = 4.0;

  const inBorder = (
    (Math.abs(x - left) <= stroke / 2 && y >= top && y <= bottom) ||
    (Math.abs(x - right) <= stroke / 2 && y >= top && y <= bottom) ||
    (Math.abs(y - top) <= stroke / 2 && x >= left && x <= right) ||
    (Math.abs(y - bottom) <= stroke / 2 && x >= left && x <= right)
  );

  const onDivider = Math.abs(y - 34) <= 2.0 && x >= left && x <= right;
  const ring1 = Math.abs(x - 28) <= 2.2 && y >= 12 && y <= 24;
  const ring2 = Math.abs(x - 53) <= 2.2 && y >= 12 && y <= 24;

  const isDot1 = Math.hypot(x - 27, y - 45) <= 3.2;
  const isDot2 = Math.hypot(x - 40.5, y - 45) <= 3.2;
  const isDot3 = Math.hypot(x - 54, y - 45) <= 3.2;
  const isDot4 = Math.hypot(x - 27, y - 56) <= 3.2;
  const isDot5 = Math.hypot(x - 40.5, y - 56) <= 3.2;
  const isDot6 = Math.hypot(x - 54, y - 56) <= 3.2;

  if (inBorder || onDivider || ring1 || ring2 || isDot1 || isDot2 || isDot3 || isDot4 || isDot5 || isDot6) {
    return color;
  }
  if (filled && x > left && x < right && y > top && y < 34) {
    return [color[0], color[1], color[2], 70];
  }
  return [0, 0, 0, 0];
}

// 3. Setting gear icon (设置)
function drawSetting(x, y, w, h, color, filled = false) {
  const cx = 40.5, cy = 40.5;
  const d = Math.hypot(x - cx, y - cy);
  const stroke = 4.0;

  const onCenterHole = Math.abs(d - 9.5) <= stroke / 2;
  const onGearRing = d >= 10 && d <= 21;

  const angle = Math.atan2(y - cy, x - cx);
  const toothCount = 6;
  const normalizedAngle = (angle + Math.PI * 2) % (Math.PI * 2);
  const sector = (normalizedAngle / (Math.PI * 2)) * toothCount;
  const frac = sector - Math.floor(sector);
  const isTooth = d <= 28 && d >= 19 && (frac < 0.38 || frac > 0.62);

  if (onCenterHole || (onGearRing && d >= 15) || isTooth) {
    return color;
  }
  return [0, 0, 0, 0];
}

const imagesDir = path.join(__dirname, '..', 'images');
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

fs.writeFileSync(path.join(imagesDir, 'tab-punch.png'), createPNG(SIZE, SIZE, (x, y, w, h) => drawClock(x, y, w, h, COLOR_INACTIVE, false)));
fs.writeFileSync(path.join(imagesDir, 'tab-punch-active.png'), createPNG(SIZE, SIZE, (x, y, w, h) => drawClock(x, y, w, h, COLOR_ACTIVE, true)));

fs.writeFileSync(path.join(imagesDir, 'tab-record.png'), createPNG(SIZE, SIZE, (x, y, w, h) => drawCalendar(x, y, w, h, COLOR_INACTIVE, false)));
fs.writeFileSync(path.join(imagesDir, 'tab-record-active.png'), createPNG(SIZE, SIZE, (x, y, w, h) => drawCalendar(x, y, w, h, COLOR_ACTIVE, true)));

fs.writeFileSync(path.join(imagesDir, 'tab-setting.png'), createPNG(SIZE, SIZE, (x, y, w, h) => drawSetting(x, y, w, h, COLOR_INACTIVE, false)));
fs.writeFileSync(path.join(imagesDir, 'tab-setting-active.png'), createPNG(SIZE, SIZE, (x, y, w, h) => drawSetting(x, y, w, h, COLOR_ACTIVE, true)));

console.log('All 81x81 tab icons generated successfully in images/');
