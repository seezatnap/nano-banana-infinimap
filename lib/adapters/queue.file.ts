import fs from "node:fs/promises";
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
    console.log(`\n📋 QUEUE: Received job "${name}" for tile z:${payload.z} x:${payload.x} y:${payload.y}`);
    console.log(`   Prompt: "${payload.prompt}"`);

    await ensureQueueDir();

    // serialize per-tile; run job right away (in-process)
    const key = `${payload.z}/${payload.x}/${payload.y}`;
    console.log(`   Job key: ${key}`);

    if (RUNNING.has(key)) {
      console.log(`   ⚠️ Job already running for tile ${key}, skipping duplicate request`);
      return; // ignore duplicate bursts
    }

    console.log(`   🚀 Starting job execution for tile ${key}`);
    RUNNING.add(key);

    const startTime = Date.now();
    try {
      console.log(`   🔒 Acquiring file lock for job_${key.replace(/\//g, '_')}`);
      await withFileLock(`job_${key.replace(/\//g, '_')}`, async () => {
        console.log(`   ✅ Lock acquired, starting tile generation`);
        const res = await generateTile(payload.z, payload.x, payload.y, payload.prompt);
        console.log(`   🔗 Updating hash tree for tile ${key}`);
        await bubbleHashes(payload.z, payload.x, payload.y);
        console.log(`   ✅ Hash tree updated`);
        return res;
      });

      const elapsedTime = Date.now() - startTime;
      console.log(`   🎉 Job completed successfully in ${elapsedTime}ms for tile ${key}\n`);

    } catch (error) {
      const elapsedTime = Date.now() - startTime;
      console.error(`   ❌ Job failed after ${elapsedTime}ms for tile ${key}:`, error);
      throw error;
    } finally {
      RUNNING.delete(key);
      console.log(`   🔓 Released lock for tile ${key}`);
    }
  }
};