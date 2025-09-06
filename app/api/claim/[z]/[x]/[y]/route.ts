import { NextRequest, NextResponse } from "next/server";
import { ZMAX } from "@/lib/coords";
import { z as zod } from "zod";
import { db } from "@/lib/adapters/db.file";
import { fileQueue } from "@/lib/adapters/queue.file";

const Body = zod.object({ prompt: zod.string().min(1, "Prompt is required").max(500) });

export async function POST(req: NextRequest, { params }:{params:Promise<{z:string,x:string,y:string}>}) {
  const { z: zStr, x: xStr, y: yStr } = await params;
  const z = Number(zStr), x = Number(xStr), y = Number(yStr);
  console.log(`\n🎯 CLAIM API: Received request for tile z:${z} x:${x} y:${y}`);
  
  if (z !== ZMAX) return NextResponse.json({ error:"Only max zoom can be claimed" }, { status:400 });

  const body = await req.json().catch(()=>({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    console.log(`   ❌ Validation error: ${firstError?.message || 'Invalid input'}`);
    return NextResponse.json({ error: firstError?.message || 'Invalid input' }, { status: 400 });
  }
  const { prompt } = parsed.data;
  console.log(`   Prompt: "${prompt}"`);

  // Check if tile is already being processed
  const existing = await db.getTile(z, x, y);
  if (existing?.status === "PENDING") {
    console.log(`   ⚠️ Tile already pending, skipping`);
    return NextResponse.json({ ok:true, status:"ALREADY_PENDING", message:"Tile generation already in progress" });
  }

  try {
    await db.upsertTile({ z,x,y, status:"PENDING" });        // idempotent mark
    console.log(`   Tile marked as PENDING in database`);
    
    await fileQueue.enqueue(`gen-${z}-${x}-${y}`, { z,x,y,prompt }); // in-process
    console.log(`   ✅ Tile generation job enqueued successfully`);
    
    return NextResponse.json({ ok:true, status:"ENQUEUED" });
  } catch (error) {
    console.error(`   ❌ Failed to enqueue tile generation for ${z}/${x}/${y}:`, error);
    // Reset status on error
    await db.updateTile(z,x,y, { status:"EMPTY" });
    return NextResponse.json({ error:"Failed to start generation", details: error instanceof Error ? error.message : "Unknown error" }, { status:500 });
  }
}