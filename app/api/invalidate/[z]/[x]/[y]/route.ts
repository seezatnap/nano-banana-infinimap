import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/adapters/db.file";
import { fileQueue } from "@/lib/adapters/queue.file";
import { z as zod } from "zod";

const requestSchema = zod.object({
  prompt: zod.string().min(1, "Prompt is required")
});

export async function POST(req: NextRequest, { params }:{params:Promise<{z:string,x:string,y:string}>}) {
  const { z: zStr, x: xStr, y: yStr } = await params;
  const z = Number(zStr), x = Number(xStr), y = Number(yStr);
  
  const body = await req.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    const response = NextResponse.json({ error: firstError?.message || 'Invalid input' }, { status: 400 });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }
  const { prompt } = parsed.data;

  const t = await db.getTile(z,x,y);
  if (!t) {
    const response = NextResponse.json({ error:"Tile not found" }, { status:404 });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }

  await db.updateTile(z,x,y, { status:"PENDING", contentVer:(t.contentVer??0)+1 });
  await fileQueue.enqueue(`regen-${z}-${x}-${y}`, { z,x,y,prompt });

  const response = NextResponse.json({ ok:true });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}