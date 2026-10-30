// Gera app-icon.png (radar branco sobre quadrado verde) para `npx tauri icon app-icon.png`.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 1024;
const SS = 3;
const GREEN = [46, 125, 50];
const px = Buffer.alloc(N * N * 4);

const inRound = (x, y) => {
  const r = N * 0.22, m = N * 0.04, lo = m + r, hi = N - m - r;
  const cx = Math.min(Math.max(x, lo), hi), cy = Math.min(Math.max(y, lo), hi);
  return Math.hypot(x - cx, y - cy) <= r && x >= m && x <= N - m && y >= m && y <= N - m;
};
const ring = (x, y, r, w) => Math.abs(Math.hypot(x - N / 2, y - N / 2) - r) <= w / 2;
const sweep = (x, y) => {
  const ax = N / 2, ay = N / 2, bx = N * 0.78, by = N * 0.22;
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) <= N * 0.03;
};

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    let bg = 0, fg = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
        if (inRound(fx, fy)) {
          bg++;
          if (ring(fx, fy, N * 0.33, N * 0.06) || ring(fx, fy, N * 0.19, N * 0.06) || Math.hypot(fx - N / 2, fy - N / 2) <= N * 0.05 || sweep(fx, fy)) fg++;
        }
      }
    }
    const total = SS * SS, i = (y * N + x) * 4;
    const a = bg / total, f = bg ? fg / bg : 0;
    px[i] = GREEN[0] + (255 - GREEN[0]) * f;
    px[i + 1] = GREEN[1] + (255 - GREEN[1]) * f;
    px[i + 2] = GREEN[2] + (255 - GREEN[2]) * f;
    px[i + 3] = Math.round(a * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8;
ihdr[9] = 6;
writeFileSync(new URL('../app-icon.png', import.meta.url), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
