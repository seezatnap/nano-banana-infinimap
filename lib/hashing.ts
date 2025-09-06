import crypto from "node:crypto";
import { db } from "./adapters/db.file";
import { parentOf } from "./coords";

export function blake2sHex(buf: Buffer | string) {
  return crypto.createHash("blake2s256").update(buf).digest("hex");
}

export function hashTilePayload(payload: {
  algorithmVersion: number;
  seed?: string;
  contentVer: number;
  bytesHash: string; // image bytes hash or "EMPTY" / "PARENT"
  childHashes?: string[];
}) {
  const s = JSON.stringify(payload);
  return blake2sHex(s).slice(0, 16);
}

export async function bubbleHashes(z:number,x:number,y:number) {
  let cur = { z,x,y };
  while (cur.z > 0) {
    const p = parentOf(cur.z, cur.x, cur.y);
    const kids = [
      { z: p.z + 1, x: p.x * 2,     y: p.y * 2     },
      { z: p.z + 1, x: p.x * 2 + 1, y: p.y * 2     },
      { z: p.z + 1, x: p.x * 2,     y: p.y * 2 + 1 },
      { z: p.z + 1, x: p.x * 2 + 1, y: p.y * 2 + 1 },
    ];
    const tiles = await db.getTiles(kids);
    const childHashes = tiles.map(t => t?.hash ?? "EMPTY");
    const bytesHash = "PARENT";
    const newHash = hashTilePayload({ algorithmVersion: 1, contentVer: 1, bytesHash, childHashes });
    const anyReady = tiles.some(t => t?.status === "READY");
    await db.upsertTile({ z: p.z, x: p.x, y: p.y, status: anyReady ? "READY" : "EMPTY", hash: newHash });
    cur = p;
  }
}