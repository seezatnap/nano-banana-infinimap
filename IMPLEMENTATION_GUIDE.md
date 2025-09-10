<!-- note: I start every project off with an implementation guide that i build with chatgpt. 
not all of this is reflective of the current state of the app but i leave it here for historicity-->

Below is a revised, copy-pasteable guide for a **Next.js + Tailwind** app that:

* Serves a **generative, neighbor-aware slippy map**.
* Uses a **single default image for all empty tiles** until they’re generated.
* Lets users click at **max zoom** to **generate** a tile via a **prompt** and a **server-side style reference/config**.
* **Combines neighbors** (if present) during generation for edge continuity.
* Stores **everything on the filesystem** with simple **adapters** so you can plug in a cloud DB later.
* Runs fully **local**: `yarn dev` is all you need.

---

# 1) Tech stack (local-only)

* **Next.js 14+ (App Router)** — UI & API.
* **Leaflet** — tile viewer.
* **Tailwind CSS** — styling.
* **Sharp** — image processing.
* **No external services** — filesystem storage:

  * `FileDB` adapter: JSON files for tile metadata.
  * `FileQueue` adapter: in-process queue with file-based locks.
  * Tile images in `.tiles/`.

> Later, you can add `CloudDB` / `CloudQueue` adapters with the same interface.

---

# 2) Install & bootstrap

```bash
# Create app
yarn create next-app imaginary-map --typescript --eslint
cd imaginary-map

# Add deps (all local)
yarn add leaflet react-leaflet
yarn add sharp
yarn add zod
yarn add uuid

# Dev-only
yarn add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**Tailwind config**

* `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

* `app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
html, body, #__next { height: 100%; }
```

---

# 3) Project structure

```
imaginary-map/
  app/
    map/page.tsx
    api/
      tiles/[z]/[x]/[y]/route.ts     // GET tile (serves .webp or default)
      claim/[z]/[x]/[y]/route.ts     // POST request to generate @ ZMAX
      invalidate/[z]/[x]/[y]/route.ts// POST invalidate a tile
      meta/[z]/[x]/[y]/route.ts      // GET metadata for cache-busting
  components/
    MapClient.tsx
  lib/
    adapters/
      db.ts                           // DB interface
      db.file.ts                      // FileDB implementation
      queue.ts                        // Queue interface
      queue.file.ts                   // FileQueue implementation
      lock.file.ts                    // File-based advisory locks
    coords.ts                         // tile/world math
    hashing.ts                        // hashes + Merkle bubbling using DB
    generator.ts                      // neighbor-aware generation orchestrator
    storage.ts                        // tile image read/write
    style.ts                          // load style control
    paths.ts                          // centralizes folders
  public/
    default-tile.webp                 // placeholder for EMPTY tiles
    style-control/
      config.json                     // style config
      ref.png                         // optional style reference image
  .env.local                          // local config (no secrets needed)
```

---

# 4) Environment (local)

`.env.local`

```
ZMAX="8"
TILE_SIZE="256"
DEFAULT_TILE_PATH="./public/default-tile.webp"
STYLE_PATH="./public/style-control/config.json"
STYLE_REF="./public/style-control/ref.png"
```

---

# 5) Core constants & paths

`lib/paths.ts`

```ts
import path from "node:path";
export const ROOT = process.cwd();
export const TILE_DIR = path.join(ROOT, ".tiles");         // images
export const META_DIR = path.join(ROOT, ".meta");           // json per tile
export const LOCK_DIR = path.join(ROOT, ".locks");          // lock files
export const QUEUE_DIR = path.join(ROOT, ".queue");         // queue state
```

Create dirs at boot if missing (we’ll do that in adapters).

---

# 6) Coordinates & math

`lib/coords.ts`

```ts
export const TILE = Number(process.env.TILE_SIZE ?? 256);
export const ZMAX = Number(process.env.ZMAX ?? 8);

export const WORLD = (1 << ZMAX) * TILE;

export function parentOf(z: number, x: number, y: number) {
  return { z: z - 1, x: Math.floor(x / 2), y: Math.floor(y / 2) };
}

export function childrenOf(z: number, x: number, y: number) {
  const zc = z + 1;
  return [
    { z: zc, x: x * 2,     y: y * 2     },
    { z: zc, x: x * 2 + 1, y: y * 2     },
    { z: zc, x: x * 2,     y: y * 2 + 1 },
    { z: zc, x: x * 2 + 1, y: y * 2 + 1 },
  ];
}
```

---

# 7) File DB adapter (JSON per tile)

`lib/adapters/db.ts` (interface)

```ts
export type TileStatus = "EMPTY" | "PENDING" | "READY";

export interface TileRecord {
  z: number; x: number; y: number;
  status: TileStatus;
  seed?: string;          // hex or decimal string
  hash?: string;          // short content hash
  contentVer?: number;    // increments on change
  updatedAt?: string;     // ISO date
  createdAt?: string;     // ISO date
}

export interface DB {
  getTile(z:number,x:number,y:number): Promise<TileRecord | null>;
  upsertTile(tr: Partial<TileRecord> & { z:number; x:number; y:number }): Promise<TileRecord>;
  updateTile(z:number,x:number,y:number, patch: Partial<TileRecord>): Promise<TileRecord>;
  getTiles(batch: {z:number,x:number,y:number}[]): Promise<TileRecord[]>;
}

export function key(z:number,x:number,y:number) { return `${z}_${x}_${y}`; }
```

`lib/adapters/db.file.ts`

```ts
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
```

---

# 8) File locks (no Redis)

`lib/adapters/lock.file.ts`

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { LOCK_DIR } from "../paths";

await fs.mkdir(LOCK_DIR, { recursive: true }).catch(() => {});

function lockPath(name:string) { return path.join(LOCK_DIR, `${name}.lock`); }

export async function withFileLock<T>(name:string, fn:()=>Promise<T>): Promise<T> {
  const p = lockPath(name);
  // try to create; if exists, wait briefly and retry (simple spin with backoff)
  const start = Date.now();
  while (true) {
    try {
      await fs.writeFile(p, String(process.pid), { flag: "wx" });
      break;
    } catch {
      if (Date.now() - start > 5000) throw new Error(`Lock timeout: ${name}`);
      await new Promise(r => setTimeout(r, 25 + Math.random()*25));
    }
  }
  try { return await fn(); }
  finally { await fs.rm(p).catch(() => {}); }
}
```

---

# 9) In-process queue (file-backed idempotency)

`lib/adapters/queue.ts` (interface)

```ts
export interface Queue {
  enqueue(name:string, payload:any): Promise<void>;
}
```

`lib/adapters/queue.file.ts`

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { QUEUE_DIR } from "../paths";
import { Queue } from "./queue";
import { withFileLock } from "./lock.file";
import { generateTile } from "../generator";
import { bubbleHashes } from "../hashing";

await fs.mkdir(QUEUE_DIR, { recursive: true }).catch(() => {});
const RUNNING = new Set<string>();

export const fileQueue: Queue = {
  async enqueue(name, payload) {
    // serialize per-tile; run job right away (in-process)
    const key = `${payload.z}/${payload.x}/${payload.y}`;
    if (RUNNING.has(key)) return; // ignore duplicate bursts
    RUNNING.add(key);
    try {
      await withFileLock(`job_${key}`, async () => {
        const res = await generateTile(payload.z, payload.x, payload.y, payload.prompt);
        await bubbleHashes(payload.z, payload.x, payload.y);
        return res;
      });
    } finally {
      RUNNING.delete(key);
    }
  }
};
```

> This queue executes jobs immediately in the same Next.js server process—great for local use. The lock avoids duplicate concurrent generation.

---

# 10) Hashing & bubbling (no DB migrations needed)

`lib/hashing.ts`

```ts
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
```

---

# 11) Storage (filesystem images)

`lib/storage.ts`

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { TILE_DIR } from "./paths";

await fs.mkdir(TILE_DIR, { recursive: true }).catch(() => {});

export function tilePath(z:number,x:number,y:number) {
  return path.join(TILE_DIR, `${z}_${x}_${y}.webp`);
}

export async function readTileFile(z:number,x:number,y:number) {
  try { return await fs.readFile(tilePath(z,x,y)); }
  catch { return null; }
}

export async function writeTileFile(z:number,x:number,y:number, buf:Buffer) {
  await fs.writeFile(tilePath(z,x,y), buf);
}
```

---

# 12) Style control

`public/style-control/config.json`

```json
{
  "name": "isomorphic-v1",
  "palette": {
    "deep": "#143C82",
    "shallow": "#1E5AA0",
    "beach": "#F0E6B4",
    "grass": "#328C3C",
    "hills": "#5B503C",
    "snow": "#E6E6E6"
  },
  "model": { "sampler": "dpmpp_2m", "steps": 25, "cfg": 5.5 }
}
```

`lib/style.ts`

```ts
import fs from "node:fs/promises";
const STYLE_PATH = process.env.STYLE_PATH ?? "./public/style-control/config.json";
const STYLE_REF = process.env.STYLE_REF ?? "./public/style-control/ref.png";

export async function loadStyleControl() {
  const json = await fs.readFile(STYLE_PATH, "utf-8");
  const cfg = JSON.parse(json);
  let ref: Buffer | null = null;
  try { ref = await fs.readFile(STYLE_REF); } catch {}
  return { cfg, ref, name: cfg.name ?? "default" };
}
```

---

# 13) Neighbor-aware generator (stub, local)

`lib/generator.ts`

```ts
import sharp from "sharp";
import { TILE, ZMAX } from "./coords";
import { writeTileFile, readTileFile } from "./storage";
import { db } from "./adapters/db.file";
import { blake2sHex, hashTilePayload } from "./hashing";
import { loadStyleControl } from "./style";

type NeighborDir = "N"|"S"|"E"|"W"|"NE"|"NW"|"SE"|"SW";
const dirs: [NeighborDir, number, number][] = [
  ["N", 0,-1], ["S", 0,1], ["E", 1,0], ["W",-1,0],
  ["NE",1,-1], ["NW",-1,-1], ["SE",1,1], ["SW",-1,1],
];

async function getNeighbors(z:number,x:number,y:number) {
  const out: {dir:NeighborDir, buf:Buffer|null}[] = [];
  for (const [dir,dx,dy] of dirs) {
    out.push({ dir, buf: await readTileFile(z, x+dx, y+dy) });
  }
  return out;
}

/** Replace this with your real ML generator. Must return 256x256 WebP. */
async function runModelStub(input: {
  prompt: string;
  styleName: string;
  neighbors: {dir:NeighborDir, buf:Buffer|null}[];
  seedHex: string;
}): Promise<Buffer> {
  // Simple visual: use seed+prompt to color; draw neighbor hints as faint borders if present.
  const base = sharp({
    create: {
      width: TILE, height: TILE, channels: 3,
      background: { r: parseInt(input.seedHex.slice(0,2),16), g: parseInt(input.seedHex.slice(2,4),16), b: (input.prompt.length*19)%255 }
    }
  }).png();

  let img = await base.toBuffer();

  // Optional: blend thin lines to indicate which neighbors exist
  const overlays: Buffer[] = [];
  for (const n of input.neighbors) {
    if (!n.buf) continue;
    // Create a 1px line on the edge where the neighbor touches (purely illustrative)
    const line = Buffer.from(
      `<svg width="${TILE}" height="${TILE}"><rect ${edgeRect(n.dir)} fill="#ffffff" fill-opacity="0.15"/></svg>`
    );
    overlays.push(await sharp(line).png().toBuffer());
  }

  if (overlays.length) {
    img = await sharp(img).composite(overlays.map(o => ({ input: o }))).toBuffer();
  }
  return await sharp(img).webp({ quality: 90 }).toBuffer();
}

function edgeRect(dir:NeighborDir): string {
  if (dir==="N") return `x="0" y="0" width="${TILE}" height="1"`;
  if (dir==="S") return `x="0" y="${TILE-1}" width="${TILE}" height="1"`;
  if (dir==="W") return `x="0" y="0" width="1" height="${TILE}"`;
  if (dir==="E") return `x="${TILE-1}" y="0" width="1" height="${TILE}"`;
  if (dir==="NE") return `x="${TILE-1}" y="0" width="1" height="1"`;
  if (dir==="NW") return `x="0" y="0" width="1" height="1"`;
  if (dir==="SE") return `x="${TILE-1}" y="${TILE-1}" width="1" height="1"`;
  return `x="0" y="${TILE-1}" width="1" height="1"`;
}

export async function generateTile(z:number,x:number,y:number, prompt:string) {
  if (z !== ZMAX) throw new Error("Generation only at max zoom");

  // Mark PENDING (idempotent upsert)
  const rec = await db.upsertTile({ z,x,y, status:"PENDING" });

  const { name: styleName } = await loadStyleControl();
  const seedHex = blake2sHex(Buffer.from(`${z}:${x}:${y}:${styleName}:${prompt}`)).slice(0,8);

  const neighbors = await getNeighbors(z,x,y);
  const buf = await runModelStub({ prompt, styleName, neighbors, seedHex });

  const bytesHash = blake2sHex(buf).slice(0,16);
  const contentVer = (rec.contentVer ?? 0) + 1;
  const hash = hashTilePayload({
    algorithmVersion: 1, contentVer, bytesHash, seed: seedHex
  });

  await writeTileFile(z,x,y,buf);
  const updated = await db.updateTile(z,x,y,{ status:"READY", hash, contentVer, seed: seedHex });
  return { hash: updated.hash!, contentVer: updated.contentVer! };
}
```

> Swap `runModelStub()` with your real generator: pass `neighbors[]`, `styleCfg/ref` (available in `loadStyleControl()`), and `prompt`. Ensure a **256×256 WebP** buffer is returned.

---

# 14) API routes

## 14.1 GET tiles

`app/api/tiles/[z]/[x]/[y]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { readTileFile } from "@/lib/storage";
import { blake2sHex } from "@/lib/hashing";

const DEFAULT_PATH = process.env.DEFAULT_TILE_PATH ?? "./public/default-tile.webp";

export async function GET(_req: NextRequest, { params }:{params:{z:string,x:string,y:string}}) {
  const z = Number(params.z), x = Number(params.x), y = Number(params.y);
  let body = await readTileFile(z,x,y);
  if (!body) body = await fs.readFile(path.resolve(DEFAULT_PATH));

  const etag = `"${blake2sHex(body).slice(0,16)}"`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type":"image/webp",
      "Cache-Control":"public, max-age=31536000, immutable",
      "ETag": etag
    }
  });
}
```

## 14.2 POST claim (enqueue local job)

`app/api/claim/[z]/[x]/[y]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { ZMAX } from "@/lib/coords";
import { z as zod } from "zod";
import { db } from "@/lib/adapters/db.file";
import { fileQueue } from "@/lib/adapters/queue.file";

const Body = zod.object({ prompt: zod.string().max(500).default("") });

export async function POST(req: NextRequest, { params }:{params:{z:string,x:string,y:string}}) {
  const z = Number(params.z), x = Number(params.x), y = Number(params.y);
  if (z !== ZMAX) return NextResponse.json({ error:"Only max zoom can be claimed" }, { status:400 });

  const { prompt } = Body.parse(await req.json().catch(()=>({})));

  await db.upsertTile({ z,x,y, status:"PENDING" });        // idempotent mark
  fileQueue.enqueue(`gen-${z}-${x}-${y}`, { z,x,y,prompt }); // in-process

  return NextResponse.json({ ok:true, status:"ENQUEUED" });
}
```

## 14.3 POST invalidate (regenerate)

`app/api/invalidate/[z]/[x]/[y]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/adapters/db.file";
import { fileQueue } from "@/lib/adapters/queue.file";

export async function POST(_req: NextRequest, { params }:{params:{z:string,x:string,y:string}}) {
  const z = Number(params.z), x = Number(params.x), y = Number(params.y);
  const t = await db.getTile(z,x,y);
  if (!t) return NextResponse.json({ error:"Tile not found" }, { status:404 });

  await db.updateTile(z,x,y, { status:"PENDING", contentVer:(t.contentVer??0)+1 });
  await fileQueue.enqueue(`regen-${z}-${x}-${y}`, { z,x,y,prompt:"regenerate" });

  return NextResponse.json({ ok:true });
}
```

## 14.4 GET meta

`app/api/meta/[z]/[x]/[y]/route.ts`

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/adapters/db.file";

export async function GET(_req: Request, { params }:{params:{z:string,x:string,y:string}}) {
  const z = Number(params.z), x = Number(params.x), y = Number(params.y);
  const t = await db.getTile(z,x,y);
  return NextResponse.json({
    status: t?.status ?? "EMPTY",
    hash: t?.hash ?? "EMPTY",
    updatedAt: t?.updatedAt ?? null
  });
}
```

---

# 15) Frontend (Leaflet + Tailwind)

`components/MapClient.tsx`

```tsx
"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";

const MAX_Z = Number(process.env.NEXT_PUBLIC_ZMAX ?? 8);

export default function MapClient() {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map|null>(null);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (!ref.current || map) return;
    const m = L.map(ref.current, { crs: L.CRS.Simple, minZoom: 0, maxZoom: MAX_Z });
    const world = (1 << MAX_Z) * 256;
    const sw = m.unproject([0, world], MAX_Z);
    const ne = m.unproject([world, 0], MAX_Z);
    const bounds = new L.LatLngBounds(sw, ne);
    m.setMaxBounds(bounds);
    m.fitBounds(bounds);

    L.tileLayer(`/api/tiles/{z}/{x}/{y}.webp`, { tileSize:256, minZoom:0, maxZoom:MAX_Z, noWrap:true })
      .addTo(m);

    m.on("click", async (e) => {
      if (m.getZoom() !== m.getMaxZoom()) return;
      const p = m.project(e.latlng, m.getZoom());
      const x = Math.floor(p.x / 256), y = Math.floor(p.y / 256);
      await fetch(`/api/claim/${MAX_Z}/${x}/${y}`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ prompt })
      });
      // optional: small toast that tile was enqueued
    });

    setMap(m);
  }, [map]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="p-3 z-10 absolute top-2 left-2 bg-white/90 rounded-xl shadow flex gap-2 items-center">
        <input
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe this area…"
          className="border rounded px-3 py-2 w-80"
        />
        <span className="text-sm text-gray-500">Zoom to max, click to generate</span>
      </div>
      <div ref={ref} className="w-full h-full" />
    </div>
  );
}
```

`app/map/page.tsx`

```tsx
export default function Page() {
  return (
    <main className="w-screen h-screen">
      {/* @ts-expect-error async boundary not needed */}
      <ClientBoundary />
    </main>
  );
}

async function ClientBoundary() {
  const MapClient = (await import("@/components/MapClient")).default;
  return <MapClient />;
}
```

---

# 16) Behavior recap (with your requirements)

* **Blank by default**: all tiles (any zoom) serve **`public/default-tile.webp`** until generated.
* **Generate “empty” tiles at max zoom**: user clicks at max zoom; a job is **enqueued locally**; when done, the tile image is written to `.tiles/` and metadata to `.meta/`.
* **Neighbor-aware**: generator reads any existing neighbor images and incorporates them (stub shows where—replace with your model code).
* **Style control**: server reads `public/style-control/config.json` (+ optional `ref.png`) each generation call; change the file to affect style globally without redeploy.
* **Parent refresh**: we compute parent **hashes** based on children; clients can rely on ETag (already set). If you want hard cache-busting in the URL, you can later extend Leaflet’s URL template to include `?v=` from `/api/meta`.

---

# 17) Optional niceties (still local)

* **Mosaic parents**: add the resize-of-4-children approach (same as in the previous guide) to generate nicer parent tiles on demand. If any child is missing, fall back to default.
* **Status polling / tiny HUD**: poll `/api/meta` for the tile you just requested; if status flips to READY, call `tileLayer.redraw()` to fetch a fresh tile.
* **Metatiling 2×2**: in your real generator, render 512×512 then crop to 256 to remove seams.

---

# 18) Scripts

`package.json` (add)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
```

---

# 19) What to swap when going cloud later

* **DB**: Implement `CloudDB` with the same `DB` interface (getTile, upsertTile, updateTile, getTiles). Replace imports of `db` with the new adapter.
* **Queue**: Implement `CloudQueue` (e.g., BullMQ) with the same `Queue` interface (enqueue). The rest of the app doesn’t change.
* **Storage**: Switch `.tiles` to object storage (S3/GCS) by replacing `readTileFile`/`writeTileFile`.
