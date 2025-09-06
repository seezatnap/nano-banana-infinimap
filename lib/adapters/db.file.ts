import fs from "node:fs/promises";
import path from "node:path";
import { META_DIR } from "../paths";
import { DB, TileRecord, key } from "./db";

async function ensureDirs() {
  await fs.mkdir(META_DIR, { recursive: true }).catch(() => {});
}

function metaPath(z:number,x:number,y:number) {
  return path.join(META_DIR, `${key(z,x,y)}.json`);
}

export class FileDB implements DB {
  ready: Promise<void>;
  constructor(){ this.ready = ensureDirs(); }

  async getTile(z:number,x:number,y:number): Promise<TileRecord|null> {
    await this.ready;
    try {
      const buf = await fs.readFile(metaPath(z,x,y), "utf-8");
      return JSON.parse(buf) as TileRecord;
    } catch { return null; }
  }

  async upsertTile(tr: Partial<TileRecord> & { z:number; x:number; y:number }): Promise<TileRecord> {
    await this.ready;
    const current = await this.getTile(tr.z, tr.x, tr.y);
    const now = new Date().toISOString();
    const merged: TileRecord = {
      z: tr.z, x: tr.x, y: tr.y,
      status: current?.status ?? "EMPTY",
      seed: tr.seed ?? current?.seed,
      hash: tr.hash ?? current?.hash,
      contentVer: tr.contentVer ?? current?.contentVer ?? 1,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    if (tr.status) merged.status = tr.status;
    await fs.writeFile(metaPath(tr.z,tr.x,tr.y), JSON.stringify(merged));
    return merged;
  }

  async updateTile(z:number,x:number,y:number, patch: Partial<TileRecord>): Promise<TileRecord> {
    const cur = await this.getTile(z,x,y);
    const now = new Date().toISOString();
    const merged: TileRecord = {
      z,x,y,
      status: patch.status ?? cur?.status ?? "EMPTY",
      seed: patch.seed ?? cur?.seed,
      hash: patch.hash ?? cur?.hash,
      contentVer: patch.contentVer ?? cur?.contentVer ?? 1,
      createdAt: cur?.createdAt ?? now,
      updatedAt: now,
    };
    await fs.writeFile(metaPath(z,x,y), JSON.stringify(merged));
    return merged;
  }

  async getTiles(batch:{z:number,x:number,y:number}[]): Promise<TileRecord[]> {
    return Promise.all(batch.map(b => this.getTile(b.z,b.x,b.y))).then(list => list.map(x=>x??({z:0,x:0,y:0,status:"EMPTY"} as any)));
  }
}

export const db = new FileDB();