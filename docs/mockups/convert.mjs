import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = dirname(fileURLToPath(import.meta.url));
const files = (await readdir(dir)).filter((f) => f.endsWith('.svg'));

const SCALE = 2; // 390x844 -> 780x1688

for (const file of files.sort()) {
  const svg = await readFile(join(dir, file));
  const out = join(dir, basename(file, '.svg') + '.png');
  await sharp(svg, { density: 72 * SCALE })
    .resize(390 * SCALE, 844 * SCALE, { fit: 'fill' })
    .png()
    .toFile(out);
  console.log('->', basename(out));
}
console.log('Listo:', files.length, 'PNG generados');
