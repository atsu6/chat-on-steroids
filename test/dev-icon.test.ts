import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { afterAll, expect, it } from 'vitest';

const root = mkdtempSync(path.join(tmpdir(), 'venice-icon-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

it('generates every review size, Retina tray templates and all existing icon outputs', () => {
  for (const directory of ['scripts', 'artwork']) mkdirSync(path.join(root, directory));
  for (const file of ['scripts/make-icon.mjs', 'artwork/app-icon-source.png']) copyFileSync(file, path.join(root, file));
  execFileSync(process.execPath, [path.join(root, 'scripts/make-icon.mjs')]);
  for (const size of [16, 22, 32, 48, 128, 256, 512]) {
    for (const prefix of ['icon', 'ferro-template']) {
      const png = readFileSync(path.join(root, `build/icons/${prefix}${size}.png`));
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
  }
  const ico = readFileSync(path.join(root, 'build/icon.ico'));
  expect(ico.readUInt16LE(4)).toBe(6);
  for (const file of ['build/icon.png', 'build/icon-preview.png', 'build/runtime-icon.png', 'build/installerHeader.bmp',
    'build/installerSidebar.bmp', 'artwork/trayTemplate.png', 'artwork/trayTemplate@2x.png',
    ...[16, 32, 48, 128].map(size => `extension/icons/icon${size}.png`)]) expect(existsSync(path.join(root, file)), file).toBe(true);
  for (const [file, width, height] of [['installerHeader.bmp', 150, 57], ['installerSidebar.bmp', 164, 314]] as const) {
    const bmp = readFileSync(path.join(root, 'build', file));
    expect(bmp.toString('ascii', 0, 2)).toBe('BM');
    expect(bmp.readInt32LE(18)).toBe(width);
    expect(bmp.readInt32LE(22)).toBe(height);
    expect(bmp.includes(Buffer.from([66, 62, 18])), `${file}: current teal branding`).toBe(true);
  }
  // The generated source is RGBA/filter-0: template pixels must be white or transparent,
  // not a teal tile masquerading as a macOS template image.
  const png = readFileSync(path.join(root, 'artwork/trayTemplate.png'));
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(chunks));
  let visible = 0, transparent = 0;
  for (let y = 0; y < 16; y++) {
    expect(pixels[y * 65]).toBe(0);
    for (let x = 0; x < 16; x++) {
      const at = y * 65 + 1 + x * 4;
      if (pixels[at + 3]) {
        visible++;
        expect([...pixels.subarray(at, at + 3)]).toEqual([255, 255, 255]);
      } else transparent++;
    }
  }
  expect(visible).toBeGreaterThan(30);
  expect(transparent).toBeGreaterThan(30);
});
