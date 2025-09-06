/* Regenerate all parent tiles from existing max-zoom tiles.
 * Usage: yarn regen:parents
 */

import { generateAllParentTiles } from "../lib/parentTiles";
import { ZMAX } from "../lib/coords";
import { TILE_DIR } from "../lib/paths";
import fs from "node:fs/promises";
import path from "node:path";

async function backupParentTiles() {
  try {
    // Ensure tile dir exists
    await fs.mkdir(TILE_DIR, { recursive: true });
  } catch {}

  // Create timestamped backup directory inside .tiles/.bak/
  const ts = new Date();
  const stamp = `${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,'0')}-${String(ts.getDate()).padStart(2,'0')}` +
                `_${String(ts.getHours()).padStart(2,'0')}${String(ts.getMinutes()).padStart(2,'0')}${String(ts.getSeconds()).padStart(2,'0')}`;
  const bakBase = path.join(TILE_DIR, ".bak");
  const bakDir = path.join(bakBase, stamp);
  await fs.mkdir(bakDir, { recursive: true });

  const entries = await fs.readdir(TILE_DIR, { withFileTypes: true });
  let moved = 0;
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.endsWith('.webp')) continue;
    const m = ent.name.match(/^(\d+)_([0-9]+)_([0-9]+)\.webp$/);
    if (!m) continue;
    const z = Number(m[1]);
    if (!(z < ZMAX)) continue; // only parents
    const src = path.join(TILE_DIR, ent.name);
    const dst = path.join(bakDir, ent.name);
    try {
      await fs.rename(src, dst); // move (remove from source)
      moved++;
    } catch (err) {
      // If rename fails (e.g., cross-device), try copy+unlink
      try {
        const buf = await fs.readFile(src);
        await fs.writeFile(dst, buf);
        await fs.unlink(src);
        moved++;
      } catch (err2) {
        console.warn(`   ⚠️ Failed to move ${ent.name}:`, err2);
      }
    }
  }
  console.log(`   📦 Backed up ${moved} parent tile(s) to ${path.relative(process.cwd(), bakDir)}`);
}

async function main() {
  console.log(`\n🔄 Regenerating all parent tiles (z=${ZMAX - 1}..0)\n`);
  const started = Date.now();
  try {
    // For the CLI regen command, treat parents as invalid: back them up and remove from source dir
    await backupParentTiles();
    await generateAllParentTiles();
    const ms = Date.now() - started;
    console.log(`\n✅ Parent regeneration complete in ${(ms/1000).toFixed(1)}s`);
  } catch (err) {
    console.error("❌ Failed to regenerate parent tiles:", err);
    process.exitCode = 1;
  }
}

main();
