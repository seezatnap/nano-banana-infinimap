import sharp from "sharp";
import { TILE, ZMAX } from "./coords";
import { writeTileFile, readTileFile } from "./storage";
import { db } from "./adapters/db.file";
import { blake2sHex, hashTilePayload } from "./hashing";
import { loadStyleControl } from "./style";
import ai from "./gemini";
import fs from "node:fs/promises";

type NeighborDir = "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";
const dirs: [NeighborDir, number, number][] = [
  ["N", 0, -1], ["S", 0, 1], ["E", 1, 0], ["W", -1, 0],
  ["NE", 1, -1], ["NW", -1, -1], ["SE", 1, 1], ["SW", -1, 1],
];

const GRID_SIZE = TILE * 3; // 768x768
const MODEL_NAME = 'gemini-2.5-flash-image-preview';
const DEBUG_MODE = (process.env.DEBUG_GENERATION ?? '1') !== '0';

const neighborPositions: { [key in NeighborDir]: { x: number, y: number } } = {
  'NW': { x: 0, y: 0 }, 'N': { x: TILE, y: 0 }, 'NE': { x: TILE * 2, y: 0 },
  'W': { x: 0, y: TILE }, 'E': { x: TILE * 2, y: TILE },
  'SW': { x: 0, y: TILE * 2 }, 'S': { x: TILE, y: TILE * 2 }, 'SE': { x: TILE * 2, y: TILE * 2 }
};

function buildCheckerboardSvg(gridSize: number, checkerSize = 16) {
  const lightGrey = { r: 200, g: 200, b: 200 };
  const white = { r: 255, g: 255, b: 255 };
  return `
      <svg width="${gridSize}" height="${gridSize}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="checkerboard" x="0" y="0" width="${checkerSize * 2}" height="${checkerSize * 2}" patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width="${checkerSize}" height="${checkerSize}" fill="rgb(${white.r},${white.g},${white.b})" />
            <rect x="${checkerSize}" y="0" width="${checkerSize}" height="${checkerSize}" fill="rgb(${lightGrey.r},${lightGrey.g},${lightGrey.b})" />
            <rect x="0" y="${checkerSize}" width="${checkerSize}" height="${checkerSize}" fill="rgb(${lightGrey.r},${lightGrey.g},${lightGrey.b})" />
            <rect x="${checkerSize}" y="${checkerSize}" width="${checkerSize}" height="${checkerSize}" fill="rgb(${white.r},${white.g},${white.b})" />
          </pattern>
        </defs>
        <rect width="${gridSize}" height="${gridSize}" fill="url(#checkerboard)" />
      </svg>
    `;
}

async function ensureDebugDir() {
  if (!DEBUG_MODE) return;
  await fs.mkdir('.debug', { recursive: true }).catch(() => {});
}

async function composeNeighborGrid(neighbors: { dir: NeighborDir, buf: Buffer | null }[]) {
  console.log('  Building composite layers with neighbors...');
  const checkerboardSvg = buildCheckerboardSvg(GRID_SIZE);
  // Create the canvas with checkerboard background
  const canvas = sharp(Buffer.from(checkerboardSvg));
  console.log('  Created 768x768 checkerboard canvas');

  // Add existing neighbors
  const neighborCount = neighbors.filter(n => n.buf !== null).length;
  console.log('  Neighbors with content:', neighborCount);

  const compositeImages: sharp.OverlayOptions[] = [];
  for (const n of neighbors) {
    if (n.buf) {
      const pos = neighborPositions[n.dir];
      if (pos) {
        const resized = await sharp(n.buf).resize(TILE, TILE, { fit: 'fill' }).toBuffer();
        compositeImages.push({ input: resized, left: pos.x, top: pos.y });
      }
    }
  }

  // Create the composite grid
  console.log(`  Composing ${compositeImages.length} neighbor tiles onto canvas`);
  const gridImage = await canvas.composite(compositeImages).png().toBuffer();
  console.log(`  ✅ Created 3x3 grid context image: ${gridImage.length} bytes`);
  return gridImage;
}

function buildFullPrompt(styleName: string, prompt: string) {
  return `complete image. do not modify existing art's position or content.

Style: ${styleName}
Additional context: ${prompt || 'tropical islands with beaches and ocean'}`;
}

async function getNeighbors(z: number, x: number, y: number) {
  console.log(`🔍 Gathering neighbors for z:${z} x:${x} y:${y}`);
  const out: { dir: NeighborDir, buf: Buffer | null }[] = [];
  for (const [dir, dx, dy] of dirs) {
    const neighborX = x + dx;
    const neighborY = y + dy;
    const buf = await readTileFile(z, neighborX, neighborY);
    console.log(`   ${dir} neighbor (${neighborX},${neighborY}): ${buf ? buf.length + ' bytes' : 'not found'}`);
    out.push({ dir, buf });
  }
  return out;
}

/** Generate tile using Gemini nano-banana model */
async function runModel(input: {
  prompt: string;
  styleName: string;
  neighbors: { dir: NeighborDir, buf: Buffer | null }[];
  seedHex: string;
}): Promise<Buffer> {
  console.log('🎨 Starting Gemini tile generation');
  console.log('  Prompt:', input.prompt);
  console.log('  Style:', input.styleName);
  console.log('  Seed:', input.seedHex);

  try {
    // Create a 3x3 grid (768x768) with the center marked for generation
    const gridSize = GRID_SIZE;
    const gridImage = await composeNeighborGrid(input.neighbors);

    // Debug: Save the grid (enable for debugging)
    if (DEBUG_MODE) {
      await ensureDebugDir();
      await sharp(gridImage).toFile(`.debug/debug-grid-${input.seedHex}.png`);
      console.log(`  Saved debug grid: .debug/debug-grid-${input.seedHex}.png`);
    }

    // Convert to base64 for Gemini
    const gridBase64 = gridImage.toString('base64');

    // Build the prompt
    const fullPrompt = buildFullPrompt(input.styleName, input.prompt);

    console.log('  📝 Full prompt prepared:', fullPrompt.substring(0, 100) + '...');

    const userParts: Array<{text?: string, inlineData?: {data: string, mimeType: string}}> = [
      { text: fullPrompt },
      {
        inlineData: {
          data: gridBase64,
          mimeType: 'image/png'
        }
      }
    ];

    const contents = [{
      role: 'user',
      parts: userParts
    }];

    const config = {
      responseModalities: ['IMAGE'],
    };

    const model = MODEL_NAME;
    console.log(`  🌐 Calling Gemini API with model: ${model}`);
    console.log(`  📊 Request payload size: ${gridBase64.length} chars for context image`);
    const startTime = Date.now();

    const response = await ai.models.generateContentStream({
      model,
      config,
      contents,
    });

    let imageBase64: string | null = null;
    let chunkCount = 0;

    console.log('  📥 Processing streaming response...');
    for await (const chunk of response) {
      chunkCount++;
      console.log(`  📦 Processing chunk ${chunkCount}...`);

      if (chunk.promptFeedback?.blockReason) {
        console.error(`  ❌ Content blocked by Gemini: ${chunk.promptFeedback.blockReason}`);
        throw new Error(`Content blocked: ${chunk.promptFeedback.blockReason}`);
      }

      if (chunk.candidates && chunk.candidates.length > 0) {
        const candidate = chunk.candidates[0];
        console.log(`  📋 Candidate finish reason: ${candidate.finishReason || 'IN_PROGRESS'}`);

        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT') {
          console.error(`  ❌ Content blocked: ${candidate.finishReason}`);
          throw new Error(`Content blocked: ${candidate.finishReason}`);
        }

        if (candidate.content?.parts) {
          console.log(`  📄 Processing ${candidate.content.parts.length} content parts`);
          for (const part of candidate.content.parts) {
            if (part.inlineData?.data) {
              imageBase64 = part.inlineData.data;
              console.log(`  🖼️ Found image data in response chunk, size: ${imageBase64.length} chars`);
              break;
            }
          }
          if (imageBase64) {
            console.log(`  ✅ Complete image received in chunk ${chunkCount}`);
            break;
          }
        }
      }
    }

    if (!imageBase64) {
      console.error('  ❌ No image data received from Gemini after processing all chunks');
      throw new Error('No image generated from Gemini');
    }

    const elapsedTime = Date.now() - startTime;
    console.log(`  ✅ Image generated successfully in ${elapsedTime}ms`);

    // Convert base64 to buffer
    const imgBuffer = Buffer.from(imageBase64, 'base64');
    console.log(`  🔄 Converting base64 response to buffer: ${imgBuffer.length} bytes`);

    // Check the actual dimensions of the returned image
    const metadata = await sharp(imgBuffer).metadata();
    console.log(`  📏 Returned image dimensions: ${metadata.width}x${metadata.height}`);
    console.log(`  📄 Image format: ${metadata.format}, channels: ${metadata.channels}`);

    // Debug: Save the response
    if (DEBUG_MODE) {
      await ensureDebugDir();
      await sharp(imgBuffer).toFile(`.debug/debug-response-${input.seedHex}.png`);
      console.log(`  Saved debug response: .debug/debug-response-${input.seedHex}.png`);
    }

    // Calculate extraction coordinates based on actual image size
    let extractLeft = TILE;
    let extractTop = TILE;
    let extractWidth = TILE;
    let extractHeight = TILE;

    if (metadata.width !== gridSize || metadata.height !== gridSize) {
      console.log(`  ⚠️ Warning: Expected 768x768 but got ${metadata.width}x${metadata.height}`);

      if (metadata.width && metadata.height) {
        // Calculate scale factor
        const scale = metadata.width / gridSize;

        // Scale the extraction coordinates proportionally
        extractLeft = Math.floor(TILE * scale);
        extractTop = Math.floor(TILE * scale);
        extractWidth = Math.floor(TILE * scale);
        extractHeight = Math.floor(TILE * scale);

        console.log(`  Scaling extraction by ${scale.toFixed(2)}x: extracting ${extractWidth}x${extractHeight} from position (${extractLeft}, ${extractTop})`);
      }
    }

    // Extract and resize the center tile
    console.log(`  ✂️ Extracting center tile from (${extractLeft}, ${extractTop}) with size ${extractWidth}x${extractHeight}`);
    const extractedBuffer = await sharp(imgBuffer)
      .extract({
        left: extractLeft,
        top: extractTop,
        width: extractWidth,
        height: extractHeight
      })
      .toBuffer();

    console.log(`  📐 Extracted buffer size: ${extractedBuffer.length} bytes`);

    const centerTile = await sharp(extractedBuffer)
      .resize(TILE, TILE, { kernel: 'lanczos3' }) // Ensure final size is always 256x256
      .webp({ quality: 90 })
      .toBuffer();

    console.log(`  🎯 Final center tile: ${centerTile.length} bytes (256x256 WebP)`);
    return centerTile;
  } catch (error) {
    console.error('❌ Gemini generation error:', error);
    console.log('  Falling back to stub generator');
    // Fallback to stub generator on error
    return runModelStub(input);
  }
}

/** Stub generator for fallback */
async function runModelStub(input: {
  prompt: string;
  styleName: string;
  neighbors: { dir: NeighborDir, buf: Buffer | null }[];
  seedHex: string;
}): Promise<Buffer> {
  console.log('  🔧 Using stub generator as fallback');
  console.log(`  🎨 Creating base tile with seed-based color: ${input.seedHex.slice(0, 6)}`);

  const base = sharp({
    create: {
      width: TILE, height: TILE, channels: 3,
      background: { r: parseInt(input.seedHex.slice(0, 2), 16), g: parseInt(input.seedHex.slice(2, 4), 16), b: (input.prompt.length * 19) % 255 }
    }
  }).png();

  let img = await base.toBuffer();
  console.log(`  📦 Base tile created: ${img.length} bytes`);

  const overlays: Buffer[] = [];
  let neighborOverlayCount = 0;

  for (const n of input.neighbors) {
    if (!n.buf) continue;
    console.log(`  ➕ Adding overlay for ${n.dir} neighbor`);
    const line = Buffer.from(
      `<svg width="${TILE}" height="${TILE}"><rect ${edgeRect(n.dir)} fill="#ffffff" fill-opacity="0.15"/></svg>`
    );
    overlays.push(await sharp(line).png().toBuffer());
    neighborOverlayCount++;
  }

  if (overlays.length) {
    console.log(`  🔗 Composing ${neighborOverlayCount} neighbor overlays`);
    img = await sharp(img).composite(overlays.map(o => ({ input: o }))).toBuffer();
    console.log(`  📦 Composite image: ${img.length} bytes`);
  } else {
    console.log('  ℹ️ No neighbor overlays to apply');
  }

  const finalTile = await sharp(img).webp({ quality: 90 }).toBuffer();
  console.log(`  ✅ Stub tile completed: ${finalTile.length} bytes (WebP)`);
  return finalTile;
}

function edgeRect(dir: NeighborDir): string {
  if (dir === "N") return `x="0" y="0" width="${TILE}" height="1"`;
  if (dir === "S") return `x="0" y="${TILE - 1}" width="${TILE}" height="1"`;
  if (dir === "W") return `x="0" y="0" width="1" height="${TILE}"`;
  if (dir === "E") return `x="${TILE - 1}" y="0" width="1" height="${TILE}"`;
  if (dir === "NE") return `x="${TILE - 1}" y="0" width="1" height="1"`;
  if (dir === "NW") return `x="0" y="0" width="1" height="1"`;
  if (dir === "SE") return `x="${TILE - 1}" y="${TILE - 1}" width="1" height="1"`;
  return `x="0" y="${TILE - 1}" width="1" height="1"`;
}

/** Generate a tile preview without saving to disk */
export async function generateTilePreview(z: number, x: number, y: number, prompt: string): Promise<Buffer> {
  console.log(`\n🎨 generateTilePreview called for z:${z} x:${x} y:${y}`);
  console.log(`   User prompt: "${prompt}"`);

  if (z !== ZMAX) throw new Error("Generation only at max zoom");

  const { name: styleName } = await loadStyleControl();
  const seedHex = blake2sHex(Buffer.from(`${z}:${x}:${y}:${styleName}:${prompt}`)).slice(0, 8);

  const neighbors = await getNeighbors(z, x, y);
  const buf = await runModel({ prompt, styleName, neighbors, seedHex });

  console.log(`   ✨ Tile preview generated for z:${z} x:${x} y:${y}\n`);
  return buf;
}

/**
 * Generate a full 3×3 grid preview image (768×768 WebP) containing
 * the model's predicted content for the neighborhood. Used by the
 * edit preview modal so empty cells can display inbound content.
 */
export async function generateGridPreview(z: number, x: number, y: number, prompt: string): Promise<Buffer> {
  if (z !== ZMAX) throw new Error("Generation only at max zoom");

  const { name: styleName } = await loadStyleControl();
  const seedHex = blake2sHex(Buffer.from(`${z}:${x}:${y}:${styleName}:${prompt}`)).slice(0, 8);
  const neighbors = await getNeighbors(z, x, y);

  try {
    // Reuse the same request building as runModel but return the full grid image.
    const gridContext = await composeNeighborGrid(neighbors);

    // Send the full grid to the model
    const fullPrompt = buildFullPrompt(styleName, prompt);
    const contents = [{
      role: 'user',
      parts: [
        { text: fullPrompt },
        { inlineData: { data: gridContext.toString('base64'), mimeType: 'image/png' } }
      ]
    }];

    const response = await ai.models.generateContentStream({
      model: MODEL_NAME,
      config: { responseModalities: ['IMAGE'] },
      contents,
    });

    let imageBase64: string | null = null;
    for await (const chunk of response) {
      if (chunk.candidates && chunk.candidates.length > 0) {
        const candidate = chunk.candidates[0];
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData?.data) { imageBase64 = part.inlineData.data; break; }
          }
          if (imageBase64) break;
        }
      }
    }

    if (!imageBase64) throw new Error('No image generated from Gemini');
    let imgBuffer = Buffer.from(imageBase64, 'base64');

    // Normalize to 768×768 and WebP
    const meta = await sharp(imgBuffer).metadata();
    if (meta.width !== GRID_SIZE || meta.height !== GRID_SIZE) {
      // @ts-expect-error TODO: fix types
      imgBuffer = await sharp(imgBuffer).resize(GRID_SIZE, GRID_SIZE, { fit: 'fill' }).toBuffer();
    }
    return await sharp(imgBuffer).webp({ quality: 90 }).toBuffer();
  } catch (err) {
    // Fallback: compose neighbors and stub-generated center into a 3×3 grid
    const center = await runModelStub({ prompt, styleName, neighbors, seedHex });

    const composites: sharp.OverlayOptions[] = [];
    // Place neighbors
    const pos = [
      [0, 0, 'NW'], [1, 0, 'N'], [2, 0, 'NE'],
      [0, 1, 'W'], [1, 1, 'C'], [2, 1, 'E'],
      [0, 2, 'SW'], [1, 2, 'S'], [2, 2, 'SE']
    ] as const;
    for (const [cx, cy, key] of pos) {
      if (key === 'C') {
        composites.push({ input: center, left: cx * TILE, top: cy * TILE });
        continue;
      }
      const n = neighbors.find(nn => nn.dir === key);
      if (n?.buf) {
        const resized = await sharp(n.buf).resize(TILE, TILE).toBuffer();
        composites.push({ input: resized, left: cx * TILE, top: cy * TILE });
      }
    }
    return sharp({
      create: { width: TILE * 3, height: TILE * 3, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).composite(composites).webp({ quality: 90 }).toBuffer();
  }
}

export async function generateTile(z: number, x: number, y: number, prompt: string) {
  console.log(`\n📍 generateTile called for z:${z} x:${x} y:${y}`);
  console.log(`   User prompt: "${prompt}"`);

  if (z !== ZMAX) throw new Error("Generation only at max zoom");

  // Mark PENDING (idempotent upsert)
  const rec = await db.upsertTile({ z, x, y, status: "PENDING" });
  console.log(`   Tile marked as PENDING`);

  const { name: styleName } = await loadStyleControl();
  const seedHex = blake2sHex(Buffer.from(`${z}:${x}:${y}:${styleName}:${prompt}`)).slice(0, 8);

  const neighbors = await getNeighbors(z, x, y);
  const buf = await runModel({ prompt, styleName, neighbors, seedHex });

  const bytesHash = blake2sHex(buf).slice(0, 16);
  const contentVer = (rec.contentVer ?? 0) + 1;
  const hash = hashTilePayload({
    algorithmVersion: 1, contentVer, bytesHash, seed: seedHex
  });

  await writeTileFile(z, x, y, buf);
  console.log(`   Tile file written to disk`);

  const updated = await db.updateTile(z, x, y, { status: "READY", hash, contentVer, seed: seedHex });
  console.log(`   Tile marked as READY with hash: ${updated.hash}`);
  console.log(`   ✨ Tile generation complete for z:${z} x:${x} y:${y}\n`);

  // Generate parent tiles automatically
  generateParentTilesForChild(z, x, y).catch(err =>
    console.error(`Failed to generate parent tiles: ${err}`)
  );

  return { hash: updated.hash!, contentVer: updated.contentVer! };
}

async function generateParentTilesForChild(z: number, x: number, y: number) {
  const { generateParentTile } = await import("./parentTiles");
  const { parentOf } = await import("./coords");

  console.log(`   🔄 Generating parent tiles for z:${z} x:${x} y:${y}`);

  let currentZ = z;
  let currentX = x;
  let currentY = y;

  // Generate all parent tiles up to zoom level 0
  while (currentZ > 0) {
    const parent = parentOf(currentZ, currentX, currentY);
    await generateParentTile(parent.z, parent.x, parent.y);

    currentZ = parent.z;
    currentX = parent.x;
    currentY = parent.y;
  }
}
