import { NextRequest, NextResponse } from "next/server";
import { ZMAX, parentOf, childrenOf } from "@/lib/coords";
import { db } from "@/lib/adapters/db.file";
import fs from "node:fs/promises";
import { tilePath } from "@/lib/storage";
import { generateParentTile } from "@/lib/parentTiles";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ z: string, x: string, y: string }> }) {
  const { z: zStr, x: xStr, y: yStr } = await params;
  const z = Number(zStr), x = Number(xStr), y = Number(yStr);
  
  console.log(`🗑️ DELETE request for tile z:${z} x:${x} y:${y}`);
  
  if (z !== ZMAX) {
    const response = NextResponse.json({ error: "Only max zoom tiles can be deleted" }, { status: 400 });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }

  try {
    // Delete the tile file
    const path = tilePath(z, x, y);
    await fs.unlink(path).catch(() => {
      console.log(`   File not found, may already be deleted`);
    });
    
    // Update database to mark as empty
    await db.updateTile(z, x, y, { status: "EMPTY", hash: undefined, contentVer: 0 });
    
    // Regenerate parent tiles up the chain in the background
    (async () => {
      try {
        let cz = z, cx = x, cy = y;
        while (cz > 0) {
          const p = parentOf(cz, cx, cy);
          // If any child exists, rebuild the parent; otherwise remove parent and mark EMPTY
          const kids = childrenOf(p.z, p.x, p.y);
          const buffers = await Promise.all(kids.map(k => fs.readFile(tilePath(k.z,k.x,k.y)).catch(() => null)));
          const hasAnyChild = buffers.some(b => b !== null);
          if (hasAnyChild) {
            await generateParentTile(p.z, p.x, p.y);
          } else {
            const pPath = tilePath(p.z, p.x, p.y);
            await fs.unlink(pPath).catch(() => {});
            await db.updateTile(p.z, p.x, p.y, { status: "EMPTY", hash: undefined, contentVer: 0 });
          }
          cz = p.z; cx = p.x; cy = p.y;
        }
      } catch (err) {
        console.error(`   ⚠️ Error regenerating parents after delete ${z}/${x}/${y}:`, err);
      }
    })().catch(() => {});
    
    console.log(`   ✅ Tile deleted successfully`);
    const response = NextResponse.json({ ok: true, message: "Tile deleted" });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  } catch (error) {
    console.error(`Failed to delete tile ${z}/${x}/${y}:`, error);
    const response = NextResponse.json({
      error: "Failed to delete tile",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }
}
