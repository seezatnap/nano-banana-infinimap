import fs from "node:fs/promises";
import path from "node:path";
import { LOCK_DIR } from "../paths";

let ensured = false;
async function ensureLockDir() {
  if (!ensured) {
    await fs.mkdir(LOCK_DIR, { recursive: true }).catch(() => {});
    ensured = true;
    // Clean up stale locks on startup
    await cleanStaleLocks();
  }
}

async function cleanStaleLocks() {
  try {
    const files = await fs.readdir(LOCK_DIR);
    const now = Date.now();
    for (const file of files) {
      if (file.endsWith('.lock')) {
        const lockFile = path.join(LOCK_DIR, file);
        const stats = await fs.stat(lockFile).catch(() => null);
        if (stats && (now - stats.mtimeMs > 30000)) { // Remove locks older than 30 seconds
          await fs.rm(lockFile).catch(() => {});
          console.log(`Removed stale lock: ${file}`);
        }
      }
    }
  } catch {}
}

function lockPath(name:string) { return path.join(LOCK_DIR, `${name}.lock`); }

export async function withFileLock<T>(name:string, fn:()=>Promise<T>): Promise<T> {
  await ensureLockDir();
  const p = lockPath(name);
  const start = Date.now();
  
  // Check if lock exists and is stale
  const checkStale = async () => {
    try {
      const stats = await fs.stat(p);
      if (Date.now() - stats.mtimeMs > 10000) { // Lock older than 10 seconds
        await fs.rm(p).catch(() => {});
        console.log(`Removed stale lock: ${name}`);
        return true;
      }
    } catch {}
    return false;
  };
  
  while (true) {
    try {
      await fs.writeFile(p, String(process.pid), { flag: "wx" });
      break;
    } catch {
      // Check if lock is stale
      await checkStale();
      
      if (Date.now() - start > 5000) {
        // One final check for stale lock before giving up
        const wasStale = await checkStale();
        if (!wasStale) {
          throw new Error(`Lock timeout: ${name}`);
        }
      }
      await new Promise(r => setTimeout(r, 25 + Math.random()*25));
    }
  }
  
  try { 
    return await fn(); 
  } finally { 
    await fs.rm(p).catch(() => {}); 
  }
}