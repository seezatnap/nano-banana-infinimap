import path from "node:path";
export const ROOT = process.cwd();
export const TILE_DIR = path.join(ROOT, ".tiles");         // images
export const META_DIR = path.join(ROOT, ".meta");           // json per tile
export const LOCK_DIR = path.join(ROOT, ".locks");          // lock files
export const QUEUE_DIR = path.join(ROOT, ".queue");         // queue state