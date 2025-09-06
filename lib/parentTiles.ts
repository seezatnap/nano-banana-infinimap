import sharp from "sharp";
import { TILE, ZMAX } from "./coords";
import { readTileFile, writeTileFile } from "./storage";
import { childrenOf } from "./coords";
import { db } from "./adapters/db.file";
import { blake2sHex, hashTilePayload } from "./hashing";
import path from "node:path";
import fs from "node:fs/promises";

const DEFAULT_PATH = process.env.DEFAULT_TILE_PATH ?? "./public/default-tile.webp";

export async function generateParentTile(z: number, x: number, y: number): Promise<Buffer | null> {
  console.log(`🔄 Generating parent tile z:${z} x:${x} y:${y}`);
  
  // Get the four child tiles
  const children = childrenOf(z, x, y);
  console.log(`   Children coordinates:`, children.map(c => `${c.z}_${c.x}_${c.y}`).join(', '));
  
  const childBuffers: (Buffer | null)[] = [];
  
  for (const child of children) {
    const buf = await readTileFile(child.z, child.x, child.y);
    childBuffers.push(buf);
    console.log(`   Child ${child.z}_${child.x}_${child.y}: ${buf ? buf.length + ' bytes' : 'null'}`);
  }
  
  // Check if we have any child tiles
  const hasChildren = childBuffers.some(b => b !== null);
  if (!hasChildren) {
    console.log(`   No child tiles found, skipping parent generation`);
    return null;
  }
  
  // Load default tile for missing children
  const defaultTile = await fs.readFile(path.resolve(DEFAULT_PATH));
  
  let parentTile: Buffer;
  
  try {
    // Prepare all 4 child tiles as 256x256 buffers
    const tiles: Buffer[] = [];
    for (let i = 0; i < 4; i++) {
      const buffer = childBuffers[i];
      if (buffer) {
        tiles.push(buffer);
      } else {
        tiles.push(defaultTile);
      }
    }
    
    // Method: Create 2x2 grid manually
    // First row: tiles 0 and 1
    const topRow = await sharp(tiles[0])
      .resize(TILE, TILE, { fit: 'fill' })
      .extend({ right: TILE })
      .composite([{
        input: await sharp(tiles[1]).resize(TILE, TILE, { fit: 'fill' }).toBuffer(),
        left: TILE,
        top: 0
      }])
      .toBuffer();
    
    // Second row: tiles 2 and 3
    const bottomRow = await sharp(tiles[2])
      .resize(TILE, TILE, { fit: 'fill' })
      .extend({ right: TILE })
      .composite([{
        input: await sharp(tiles[3]).resize(TILE, TILE, { fit: 'fill' }).toBuffer(),
        left: TILE,
        top: 0
      }])
      .toBuffer();
    
    // Combine both rows
    const fullComposite = await sharp(topRow)
      .extend({ bottom: TILE })
      .composite([{
        input: bottomRow,
        left: 0,
        top: TILE
      }])
      .toBuffer();
    
    // Now resize the 512x512 composite to 256x256
    parentTile = await sharp(fullComposite)
      .resize(TILE, TILE, { kernel: 'lanczos3' })
      .webp({ quality: 85 })
      .toBuffer();
    
    console.log(`   ✅ Parent tile generated, size: ${parentTile.length} bytes`);
  } catch (error) {
    console.error(`   ❌ Error creating parent tile z:${z} x:${x} y:${y}:`, error);
    // Use default tile on error
    parentTile = await sharp(defaultTile)
      .resize(TILE, TILE, { fit: 'fill' })
      .webp({ quality: 85 })
      .toBuffer();
  }
  
  // Save the parent tile
  await writeTileFile(z, x, y, parentTile);
  
  // Update metadata
  const bytesHash = blake2sHex(parentTile).slice(0, 16);
  const existing = await db.getTile(z, x, y);
  const contentVer = (existing?.contentVer ?? 0) + 1;
  const hash = hashTilePayload({
    algorithmVersion: 1,
    contentVer,
    bytesHash,
    seed: "parent"
  });
  
  await db.upsertTile({
    z, x, y,
    status: "READY",
    hash,
    contentVer,
    seed: "parent"
  });
  
  return parentTile;
}

export async function generateAllParentTiles() {
  console.log("🔄 Regenerating all parent tiles from max-zoom children");

  // Start at one below max zoom and work down to 0
  for (let z = ZMAX - 1; z >= 0; z--) {
    console.log(`\n📍 Processing zoom level ${z}`);

    const tilesPerSide = 1 << z;
    let regenerated = 0;

    for (let x = 0; x < tilesPerSide; x++) {
      for (let y = 0; y < tilesPerSide; y++) {
        // Only regenerate if at least one child exists at z+1
        const children = childrenOf(z, x, y);
        const hasChildren = await Promise.all(
          children.map(c => readTileFile(c.z, c.x, c.y))
        ).then(buffers => buffers.some(b => b !== null));

        if (hasChildren) {
          await generateParentTile(z, x, y);
          regenerated++;
        }
      }
    }

    console.log(`   Regenerated ${regenerated} parent tiles at zoom ${z}`);
  }

  console.log("\n✅ Parent tile regeneration complete");
}
