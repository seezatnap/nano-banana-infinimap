import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { readTileFile } from "@/lib/storage";
import { blake2sHex } from "@/lib/hashing";

const DEFAULT_PATH = process.env.DEFAULT_TILE_PATH ?? "./public/default-tile.webp";

export async function GET(_req: NextRequest, { params }:{params:Promise<{z:string,x:string,y:string}>}) {
  const { z: zStr, x: xStr, y: yStr } = await params;
  const z = Number(zStr), x = Number(xStr), y = Number(yStr);
  
  console.log(`Tile z:${z} x:${x} y:${y} requested`);
  
  let body = await readTileFile(z,x,y);
  if (!body) {
    console.log(`Tile z:${z} x:${x} y:${y} does not exist yet, serving default tile.`);
    body = await fs.readFile(path.resolve(DEFAULT_PATH));
  } else {
    console.log(`Tile z:${z} x:${x} y:${y} found, buffer size: ${body.length} bytes`);
  }

  const etag = `"${blake2sHex(body).slice(0,16)}"`;
  return new NextResponse(body as any, {
    status: 200,
    headers: {
      "Content-Type":"image/webp",
      "Cache-Control":"public, max-age=31536000, immutable",
      "ETag": etag,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}
