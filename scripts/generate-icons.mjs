/**
 * One-off icon/favicon generator. Regenerates every favicon + app icon from a
 * single square source image using sharp. Also builds a multi-size favicon.ico
 * (PNG-in-ICO, supported by all evergreen browsers + IE11).
 *
 * Usage: node scripts/generate-icons.mjs <source-image>
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const source = process.argv[2] ?? "public/image_icon_recolor.jpg";
const publicDir = path.resolve("public");

const PNG_TARGETS = [
  { file: "favicon-16x16.png", size: 16 },
  { file: "favicon-32x32.png", size: 32 },
  { file: "favicon.png", size: 48 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "android-chrome-192x192.png", size: 192 },
  { file: "android-chrome-512x512.png", size: 512 },
];

const ICO_SIZES = [16, 32, 48];

function pngBuffer(size) {
  return sharp(source)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  const bodies = [];

  entries.forEach((entry, i) => {
    const base = i * 16;
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 0); // width
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1); // height
    dir.writeUInt8(0, base + 2); // palette
    dir.writeUInt8(0, base + 3); // reserved
    dir.writeUInt16LE(1, base + 4); // color planes
    dir.writeUInt16LE(32, base + 6); // bits per pixel
    dir.writeUInt32LE(entry.data.length, base + 8); // bytes in resource
    dir.writeUInt32LE(offset, base + 12); // offset
    offset += entry.data.length;
    bodies.push(entry.data);
  });

  return Buffer.concat([header, dir, ...bodies]);
}

async function main() {
  for (const { file, size } of PNG_TARGETS) {
    const buf = await pngBuffer(size);
    await writeFile(path.join(publicDir, file), buf);
    console.log(`wrote ${file} (${size}x${size}, ${buf.length} bytes)`);
  }

  const icoEntries = [];
  for (const size of ICO_SIZES) {
    icoEntries.push({ size, data: await pngBuffer(size) });
  }
  const ico = buildIco(icoEntries);
  await writeFile(path.join(publicDir, "favicon.ico"), ico);
  console.log(`wrote favicon.ico (${ICO_SIZES.join(",")}; ${ico.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
