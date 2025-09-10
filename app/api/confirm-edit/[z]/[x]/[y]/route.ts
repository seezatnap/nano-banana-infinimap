import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { writeTileFile, readTileFile } from "@/lib/storage";
import { db } from "@/lib/adapters/db.file";
import { TILE, parentOf } from "@/lib/coords";
import { blake2sHex } from "@/lib/hashing";
import { generateParentTile } from "@/lib/parentTiles";
import { translateImage } from "@/lib/drift";
import { alignCompositeOverBase } from "@/lib/drift";

const TILE_SIZE = TILE;

const requestSchema = z.object({
  previewUrl: z.string(),
  applyToAllNew: z.boolean().optional(),
  newTilePositions: z.array(z.object({
    x: z.number(),
    y: z.number()
  })).optional(),
  selectedPositions: z.array(z.object({
    x: z.number(),
    y: z.number(),
  })).optional(),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
});

// Extract individual tiles from 3x3 composite
async function extractTiles(compositeBuffer: Buffer): Promise<Buffer[][]> {
  const tiles: Buffer[][] = [];
  
  for (let y = 0; y < 3; y++) {
    const row: Buffer[] = [];
    for (let x = 0; x < 3; x++) {
      const tile = await sharp(compositeBuffer)
        .extract({
          left: x * TILE_SIZE,
          top: y * TILE_SIZE,
          width: TILE_SIZE,
          height: TILE_SIZE,
        })
        .webp()
        .toBuffer();
      row.push(tile);
    }
    tiles.push(row);
  }
  
  return tiles;
}

async function createCircularGradientMask(size: number): Promise<Buffer> {
  const center = size / 2;
  const radius = size / 2;
  const width = size, height = size, channels = 4;
  const buf = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - center, dy = y - center;
      const d = Math.sqrt(dx*dx + dy*dy);
      let a: number;
      if (d <= radius * 0.5) a = 255; else if (d >= radius) a = 0; else a = Math.round(255 * (1 - (d - radius*0.5)/(radius*0.5)));
      const i = (y*width + x) * channels;
      buf[i] = buf[i+1] = buf[i+2] = 255; buf[i+3] = a;
    }
  }
  return sharp(buf, { raw: { width, height, channels: channels as 4 } }).png().toBuffer();
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ z: string; x: string; y: string }> }
) {
  try {
    const params = await context.params;
    const z = parseInt(params.z, 10);
    const centerX = parseInt(params.x, 10);
    const centerY = parseInt(params.y, 10);
    
    const body = await req.json();
    const { previewUrl, applyToAllNew, newTilePositions, selectedPositions, offsetX, offsetY } = requestSchema.parse(body);
    const selectedSet = selectedPositions && selectedPositions.length > 0
      ? new Set(selectedPositions.map(p => `${p.x},${p.y}`))
      : null;
    
    // Extract preview ID from URL
    const previewMatch = previewUrl.match(/\/api\/preview\/(preview-[\d-]+)/);
    if (!previewMatch) {
      return NextResponse.json({ error: "Invalid preview URL" }, { status: 400 });
    }
    
    const previewId = previewMatch[1];
    const previewPath = path.join(process.cwd(), '.temp', `${previewId}.webp`);
    
    // Load the preview composite
    let compositeBuffer: Buffer;
    try {
      compositeBuffer = await fs.readFile(previewPath);
    } catch (err) {
      return NextResponse.json({ error: "Preview not found" }, { status: 404 });
    }
    
    // If user provided explicit offsets, translate composite accordingly.
    if (typeof offsetX === 'number' && typeof offsetY === 'number' && !Number.isNaN(offsetX) && !Number.isNaN(offsetY)) {
      const gridSize = TILE_SIZE * 3;
      compositeBuffer = await translateImage(await sharp(compositeBuffer).png().toBuffer(), gridSize, gridSize, Math.round(offsetX), Math.round(offsetY));
    } else {
      // Otherwise optionally align composite if any selected tiles already exist
      let anySelectedExisting = false;
      if (selectedSet) {
        for (const key of selectedSet) {
          const [sx, sy] = key.split(',').map(Number);
          const existsBuf = await readTileFile(z, sx, sy);
          if (existsBuf) { anySelectedExisting = true; break; }
        }
      } else {
        // If no explicit selection, consider the center tile
        const existsBuf = await readTileFile(z, centerX, centerY);
        anySelectedExisting = !!existsBuf;
      }
      // Use simple center-based alignment when applicable
      const centerExisting = await readTileFile(z, centerX, centerY);
      if (anySelectedExisting && centerExisting) {
        try {
          const baseTiles: Buffer[][] = [
            [0,0,0].map(() => Buffer.alloc(0)) as unknown as Buffer[],
            [0,0,0].map(() => Buffer.alloc(0)) as unknown as Buffer[],
            [0,0,0].map(() => Buffer.alloc(0)) as unknown as Buffer[],
          ];
          // Fill as transparent, then place center existing
          for (let gy = 0; gy < 3; gy++) {
            for (let gx = 0; gx < 3; gx++) {
              baseTiles[gy][gx] = await sharp({ create: { width: TILE_SIZE, height: TILE_SIZE, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } }).png().toBuffer();
            }
          }
          baseTiles[1][1] = await sharp(centerExisting).resize(TILE_SIZE, TILE_SIZE, { fit: 'fill' }).png().toBuffer();
          const baseComposite = await sharp({ create: { width: TILE_SIZE*3, height: TILE_SIZE*3, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
            .composite([
              { input: baseTiles[0][0], left: 0, top: 0 },
              { input: baseTiles[0][1], left: TILE_SIZE, top: 0 },
              { input: baseTiles[0][2], left: TILE_SIZE*2, top: 0 },
              { input: baseTiles[1][0], left: 0, top: TILE_SIZE },
              { input: baseTiles[1][1], left: TILE_SIZE, top: TILE_SIZE },
              { input: baseTiles[1][2], left: TILE_SIZE*2, top: TILE_SIZE },
              { input: baseTiles[2][0], left: 0, top: TILE_SIZE*2 },
              { input: baseTiles[2][1], left: TILE_SIZE, top: TILE_SIZE*2 },
              { input: baseTiles[2][2], left: TILE_SIZE*2, top: TILE_SIZE*2 },
            ])
            .png()
            .toBuffer();
          const { aligned } = await alignCompositeOverBase(baseComposite, compositeBuffer, TILE_SIZE);
          compositeBuffer = aligned;
        } catch {}
      }
    }

    // Extract individual tiles from the (possibly aligned) composite
    const genTiles = await extractTiles(compositeBuffer);

    // Build a radial mask once and slice per tile
    const mask3x3 = await createCircularGradientMask(TILE_SIZE * 3);

    // Save tiles with blending for existing ones
    const updatedPositions: { x:number, y:number }[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tileX = centerX + dx;
        const tileY = centerY + dy;
        const genTile = genTiles[dy + 1][dx + 1];

        // Determine if updating this position
        const existsBuf = await readTileFile(z, tileX, tileY);
        const exists = !!existsBuf;

        // Respect explicit selection when provided
        if (selectedSet && !selectedSet.has(`${tileX},${tileY}`)) {
          continue;
        }

        // Otherwise, default logic: if not accepting all new and this is a new tile, skip unless center
        if (!selectedSet && !exists && !(applyToAllNew && newTilePositions && newTilePositions.length > 0) && !(dx === 0 && dy === 0)) {
          continue;
        }

        let finalTile: Buffer = genTile;
        if (exists && existsBuf) {
          // Blend generated tile over existing using per-tile radial mask
          const tileMask = await sharp(mask3x3)
            .extract({ left: (dx + 1) * TILE_SIZE, top: (dy + 1) * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE })
            .png()
            .toBuffer();
          const maskedGen = await sharp(genTile).composite([{ input: tileMask, blend: 'dest-in' }]).webp().toBuffer();
          finalTile = await sharp(existsBuf)
            .resize(TILE_SIZE, TILE_SIZE, { fit: 'fill' })
            .composite([{ input: maskedGen, blend: 'over' }])
            .webp()
            .toBuffer();
        }

        // Save tile
        await writeTileFile(z, tileX, tileY, finalTile);
        const hash = blake2sHex(finalTile);
        await db.upsertTile({ z, x: tileX, y: tileY, status: "READY", hash });
        updatedPositions.push({ x: tileX, y: tileY });
      }
    }

    // Bottom-up regeneration: ensure parents at each level are generated
    // only after all of their children have been written/generated.
    let levelZ = z;
    let currentLevel = new Set(updatedPositions.map(p => `${p.x},${p.y}`));
    while (levelZ > 0 && currentLevel.size > 0) {
      const parents = new Map<string, {x:number,y:number}>();
      for (const key of currentLevel) {
        const [cx, cy] = key.split(',').map(Number);
        const p = parentOf(levelZ, cx, cy);
        parents.set(`${p.x},${p.y}`, { x: p.x, y: p.y });
      }

      // Generate all parents for this level
      for (const p of parents.values()) {
        await generateParentTile(levelZ - 1, p.x, p.y);
      }

      // Move up one level
      currentLevel = new Set(Array.from(parents.keys()));
      levelZ -= 1;
    }
    
    // Clean up preview file
    try {
      await fs.unlink(previewPath);
    } catch (err) {
      // Ignore cleanup errors
    }
    
    return NextResponse.json({ 
      success: true,
      message: "Tiles updated successfully",
    });
  } catch (error) {
    console.error("Confirm edit error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to confirm edit" },
      { status: 500 }
    );
  }
}
