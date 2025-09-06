import fs from "node:fs/promises";
import path from "node:path";
import { TILE_DIR } from "./paths";

let ensured = false;
async function ensureTileDir() {
  if (!ensured) {
    await fs.mkdir(TILE_DIR, { recursive: true }).catch(() => {});
    ensured = true;
  }
}

export function tilePath(z:number,x:number,y:number) {
  return path.join(TILE_DIR, `${z}_${x}_${y}.webp`);
}

export async function readTileFile(z:number,x:number,y:number) {
  try { return await fs.readFile(tilePath(z,x,y)); }
  catch { return null; }
}

export async function writeTileFile(z:number,x:number,y:number, buf:Buffer) {
  await ensureTileDir();
  await fs.writeFile(tilePath(z,x,y), buf);
}