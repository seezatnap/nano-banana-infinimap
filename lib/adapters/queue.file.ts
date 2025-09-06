import fs from "node:fs/promises";
import path from "node:path";
import { QUEUE_DIR } from "../paths";
import { Queue } from "./queue";
import { withFileLock } from "./lock.file";
import { generateTile } from "../generator";
import { bubbleHashes } from "../hashing";

let ensured = false;
async function ensureQueueDir() {
  if (!ensured) {
    await fs.mkdir(QUEUE_DIR, { recursive: true }).catch(() => {});
    ensured = true;
  }
}

const RUNNING = new Set<string>();

export const fileQueue: Queue = {
  async enqueue(name, payload) {
    await ensureQueueDir();
    // serialize per-tile; run job right away (in-process)
    const key = `${payload.z}/${payload.x}/${payload.y}`;
    if (RUNNING.has(key)) {
      console.log(`Job already running for tile ${key}, skipping`);
      return; // ignore duplicate bursts
    }
    RUNNING.add(key);
    try {
      await withFileLock(`job_${key.replace(/\//g, '_')}`, async () => {
        const res = await generateTile(payload.z, payload.x, payload.y, payload.prompt);
        await bubbleHashes(payload.z, payload.x, payload.y);
        return res;
      });
    } catch (error) {
      console.error(`Error processing tile ${key}:`, error);
      throw error;
    } finally {
      RUNNING.delete(key);
    }
  }
};