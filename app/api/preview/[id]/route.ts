import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { readTileFile } from "@/lib/storage";
import { TILE } from "@/lib/coords";

const TILE_SIZE = TILE;

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
  return sharp(buf, { raw: { width, height, channels: channels as 1 | 2 | 3 | 4 } }).png().toBuffer();
}

async function composite3x3(tiles: Buffer[][]): Promise<Buffer> {
  const gridSize = TILE_SIZE * 3;
  const overlays: sharp.OverlayOptions[] = [];
  for (let yy = 0; yy < 3; yy++) {
    for (let xx = 0; xx < 3; xx++) {
      overlays.push({ input: tiles[yy][xx], left: xx*TILE_SIZE, top: yy*TILE_SIZE });
    }
  }
  return sharp({ create: { width: gridSize, height: gridSize, channels: 4, background: { r:0,g:0,b:0,alpha:0 }}}).composite(overlays).webp().toBuffer();
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const { id } = params;
    
    // Validate ID format to prevent path traversal
    if (!/^preview-\d+-[-\d]+\.webp$/.test(id + '.webp')) {
      const response = NextResponse.json({ error: "Invalid preview ID" }, { status: 400 });
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return response;
    }
    
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'raw';
    const previewPath = path.join(process.cwd(), '.temp', `${id}.webp`);
    
    let raw: Buffer;
    try {
      raw = await fs.readFile(previewPath);
    } catch (err) {
      const response = NextResponse.json({ error: "Preview not found" }, { status: 404 });
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return response;
    }

    // If raw requested, serve as is
    if (mode !== 'blended') {
      return new NextResponse(raw as any, {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'private, max-age=60',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
      });
    }

    // Build blended preview: blend raw composite over existing tiles using
    // a radial gradient mask centered on the 3x3 grid. Empty tiles show raw.
    const parts = id.split('-');
    // id format: preview-z-x-y-timestamp
    const z = parseInt(parts[1], 10);
    const cx = parseInt(parts[2], 10);
    const cy = parseInt(parts[3], 10);
    const gridSize = TILE_SIZE * 3;
    const mask = await createCircularGradientMask(gridSize);

    // Slice raw into tiles and blend per-tile
    const output: Buffer[][] = [];
    for (let dy = 0; dy < 3; dy++) {
      const row: Buffer[] = [];
      for (let dx = 0; dx < 3; dx++) {
        const tileX = cx + dx - 1;
        const tileY = cy + dy - 1;
        const existing = await readTileFile(z, tileX, tileY);

        const rawTile = await sharp(raw).extract({ left: dx*TILE_SIZE, top: dy*TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }).webp().toBuffer();

        if (existing) {
          const tileMask = await sharp(mask).extract({ left: dx*TILE_SIZE, top: dy*TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }).png().toBuffer();
          const masked = await sharp(rawTile).composite([{ input: tileMask, blend: 'dest-in' }]).webp().toBuffer();
          const blended = await sharp(existing).resize(TILE_SIZE, TILE_SIZE, { fit: 'fill' }).composite([{ input: masked, blend: 'over' }]).webp().toBuffer();
          row.push(blended);
        } else {
          row.push(rawTile);
        }
      }
      output.push(row);
    }
    const blendedComposite = await composite3x3(output);
    return new NextResponse(blendedComposite as any, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, max-age=60',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
    });
  } catch (error) {
    console.error("Preview fetch error:", error);
    const response = NextResponse.json({ error: "Failed to fetch preview" }, { status: 500 });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }
}
