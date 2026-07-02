/**
 * Genera favicon.ico, PNGs y manifest desde public/favicon.svg
 * Uso: node scripts/generate-favicons.js
 */
const fs = require('fs');
const path = require('path');

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (_) {
    console.error('Instala sharp: npm install --save-dev sharp');
    process.exit(1);
  }

  const publicDir = path.join(__dirname, '../public');
  const svg = fs.readFileSync(path.join(publicDir, 'favicon.svg'));

  const sizes = [
    ['favicon-16.png', 16],
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512]
  ];

  for (const [name, size] of sizes) {
    await sharp(svg).resize(size, size).png().toFile(path.join(publicDir, name));
    console.log('✓', name);
  }

  const ico16 = await sharp(svg).resize(16, 16).png().toBuffer();
  const ico32 = await sharp(svg).resize(32, 32).png().toBuffer();
  const toIco = require('to-ico');
  const ico = await toIco([ico16, ico32]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), ico);
  console.log('✓ favicon.ico');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
