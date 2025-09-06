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