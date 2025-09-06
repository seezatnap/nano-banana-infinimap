import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { readTileFile, tilePath } from "@/lib/storage";
import { blake2sHex } from "@/lib/hashing";

const DEFAULT_PATH = process.env.DEFAULT_TILE_PATH ?? "./public/default-tile.webp";

export async function GET(_req: NextRequest, { params }:{params:Promise<{z:string,x:string,y:string}>}) {
  const { z: zStr, x: xStr, y: yStr } = await params;
  const z = Number(zStr), x = Number(xStr), y = Number(yStr);
  
  console.log(`📦 Tile request: z:${z} x:${x} y:${y}`);
  const tPath = tilePath(z, x, y);
  console.log(`   Looking for tile at: ${tPath}`);
  
  // Check if file exists first
  try {
    const stat = await fs.stat(tPath);
    console.log(`   File exists with size: ${stat.size} bytes`);
  } catch {
    console.log(`   File does not exist`);
  }
  
  let body = await readTileFile(z,x,y);
  if (!body) {
    console.log(`   readTileFile returned null, serving default tile`);
    body = await fs.readFile(path.resolve(DEFAULT_PATH));
  } else {
    console.log(`   Found tile, buffer size: ${body.length} bytes`);
  }

  const etag = `"${blake2sHex(body).slice(0,16)}"`;
  return new NextResponse(body as any, {
    status: 200,
    headers: {
      "Content-Type":"image/webp",
      "Cache-Control":"public, max-age=31536000, immutable",
      "ETag": etag
    }
  });
}