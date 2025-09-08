import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { generateGridPreview } from "@/lib/generator";
import { readTileFile } from "@/lib/storage";
import { TILE } from "@/lib/coords";

const TILE_SIZE = TILE;

const requestSchema = z.object({
  prompt: z.string().min(1),
  applyToAllNew: z.boolean().optional(),
  newTilePositions: z.array(z.object({
    x: z.number(),
    y: z.number()
  })).optional(),
});

// Create circular gradient mask that fully contains within 3x3 grid
async function createCircularGradientMask(size: number): Promise<Buffer> {
  const center = size / 2;
  // Radius should touch the midpoint of each side of the 3x3 grid
  const radius = size / 2;
  
  // Create a buffer for the mask
  const maskWidth = size;
  const maskHeight = size;
  const channels = 4; // RGBA
  const pixelData = Buffer.alloc(maskWidth * maskHeight * channels);
  
  // Generate gradient mask pixel by pixel
  for (let y = 0; y < maskHeight; y++) {
    for (let x = 0; x < maskWidth; x++) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Calculate alpha based on distance from center
      let alpha: number;
      if (distance <= radius * 0.5) {
        // Full opacity in the center (50% of radius)
        alpha = 255;
      } else if (distance >= radius) {
        // Fully transparent at the edge and beyond
        alpha = 0;
      } else {
        // Smooth gradient from 50% to 100% of radius
        const normalizedDist = (distance - radius * 0.5) / (radius * 0.5);
        alpha = Math.round(255 * (1 - normalizedDist));
      }
      
      const index = (y * maskWidth + x) * channels;
      pixelData[index] = 255;     // R
      pixelData[index + 1] = 255; // G
      pixelData[index + 2] = 255; // B
      pixelData[index + 3] = alpha; // A
    }
  }
  
  return sharp(pixelData, {
    raw: {
      width: maskWidth,
      height: maskHeight,
      channels: channels as 1 | 2 | 3 | 4,
    },
  })
    .png()
    .toBuffer();
}

// Fetch tiles for 3x3 grid
async function fetchTileGrid(z: number, centerX: number, centerY: number): Promise<Buffer[][]> {
  const grid: Buffer[][] = [];
  
  const defaultTileBuffer = await readTileFile(0, 0, 0);
  const defaultTile = defaultTileBuffer || Buffer.from([]); // fallback empty buffer
  
  for (let dy = -1; dy <= 1; dy++) {
    const row: Buffer[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;
      const tileBuffer = await readTileFile(z, x, y) || defaultTile;
      row.push(tileBuffer);
    }
    grid.push(row);
  }
  
  return grid;
}

// Composite 3x3 grid into single image
async function compositeTiles(grid: Buffer[][]): Promise<Buffer> {
  const gridSize = TILE_SIZE * 3;
  const composites: sharp.OverlayOptions[] = [];
  
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      composites.push({
        input: grid[y][x],
        left: x * TILE_SIZE,
        top: y * TILE_SIZE,
      });
    }
  }
  
  return sharp({
    create: {
      width: gridSize,
      height: gridSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp()
    .toBuffer();
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ z: string; x: string; y: string }> }
) {
  console.log(`\n🎨 EDIT-TILE API: Received preview request`);

  try {
    const params = await context.params;
    const z = parseInt(params.z, 10);
    const x = parseInt(params.x, 10);
    const y = parseInt(params.y, 10);
    console.log(`   Target tile: z:${z} x:${x} y:${y}`);

    const body = await req.json();
    console.log(`   Request body received, size: ${JSON.stringify(body).length} chars`);

    const { prompt } = requestSchema.parse(body);
    console.log(`   User prompt: "${prompt}"`);

    // Ask the generator for a full 3×3 composite (RAW model output)
    console.log(`   🔄 Starting grid preview generation...`);
    const startTime = Date.now();

    const finalComposite = await generateGridPreview(z, x, y, prompt);

    const generationTime = Date.now() - startTime;
    console.log(`   ✅ Grid preview generated in ${generationTime}ms, size: ${finalComposite.length} bytes`);

    // Save preview to temporary location
    const tempDir = path.join(process.cwd(), '.temp');
    console.log(`   💾 Creating temp directory: ${tempDir}`);
    await fs.mkdir(tempDir, { recursive: true });

    const previewId = `preview-${z}-${x}-${y}-${Date.now()}`;
    const previewPath = path.join(tempDir, `${previewId}.webp`);
    console.log(`   📝 Saving preview as: ${previewPath}`);

    await fs.writeFile(previewPath, finalComposite);
    console.log(`   ✅ Preview saved successfully`);

    const responseData = { previewUrl: `/api/preview/${previewId}`, previewId };
    console.log(`   🎯 Returning preview URL: ${responseData.previewUrl}`);
    console.log(`   ✨ Edit-tile API request completed successfully\n`);

    const response = NextResponse.json(responseData);
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  } catch (error) {
    console.error(`   ❌ Edit-tile error:`, error);
    const errorResponse = error instanceof Error ? error.message : "Failed to edit tile";
    console.log(`   🚨 Returning error response: ${errorResponse}`);
    const response = NextResponse.json(
      { error: errorResponse },
      { status: 500 }
    );
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }
}
