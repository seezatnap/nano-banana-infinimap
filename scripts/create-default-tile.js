const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function createDefaultTile() {
  const tile = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 230, g: 230, b: 230, alpha: 1 }
    }
  })
  .png()
  .toBuffer();

  // Add a simple grid pattern
  const svg = Buffer.from(`
    <svg width="256" height="256">
      <rect width="256" height="256" fill="#e6e6e6"/>
      <line x1="0" y1="0" x2="256" y2="0" stroke="#d0d0d0" stroke-width="1"/>
      <line x1="0" y1="0" x2="0" y2="256" stroke="#d0d0d0" stroke-width="1"/>
      <line x1="255" y1="0" x2="255" y2="256" stroke="#d0d0d0" stroke-width="1"/>
      <line x1="0" y1="255" x2="256" y2="255" stroke="#d0d0d0" stroke-width="1"/>
    </svg>
  `);

  const finalTile = await sharp(svg)
    .webp({ quality: 90 })
    .toBuffer();

  const publicDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
  }

  fs.writeFileSync(path.join(publicDir, 'default-tile.webp'), finalTile);
  console.log('Default tile created at public/default-tile.webp');
}

createDefaultTile().catch(console.error);