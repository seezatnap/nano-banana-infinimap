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

async function writeJsonAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const json = JSON.stringify(data);
  await fs.writeFile(tempPath, json);
  await fs.rename(tempPath, filePath);
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
    await writeJsonAtomic(metaPath(tr.z,tr.x,tr.y), merged);
    return merged;
  }

  async updateTile(z:number,x:number,y:number, patch: Partial<TileRecord>): Promise<TileRecord> {
    await this.ready;
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
    await writeJsonAtomic(metaPath(z,x,y), merged);
    return merged;
  }

  async getTiles(batch:{z:number,x:number,y:number}[]): Promise<TileRecord[]> {
    return Promise.all(batch.map(b => this.getTile(b.z,b.x,b.y))).then(list =>
      list.map((rec, idx) => rec ?? ({
        z: batch[idx].z,
        x: batch[idx].x,
        y: batch[idx].y,
        status: "EMPTY",
        contentVer: 0,
      } as TileRecord))
    );
  }
}

export const db = new FileDB();