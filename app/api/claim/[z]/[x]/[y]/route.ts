import { NextRequest, NextResponse } from "next/server";
import { ZMAX } from "@/lib/coords";
import { z as zod } from "zod";
import { db } from "@/lib/adapters/db.file";
import { fileQueue } from "@/lib/adapters/queue.file";

const Body = zod.object({ prompt: zod.string().min(1, "Prompt is required").max(500) });

export async function POST(req: NextRequest, { params }:{params:Promise<{z:string,x:string,y:string}>}) {
  const startTime = Date.now();
  const { z: zStr, x: xStr, y: yStr } = await params;
  const z = Number(zStr), x = Number(xStr), y = Number(yStr);
  console.log(`\n🎯 CLAIM API: Received request for tile z:${z} x:${x} y:${y}`);
  console.log(`   Request timestamp: ${new Date().toISOString()}`);

  if (z !== ZMAX) {
    console.log(`   ❌ Invalid zoom level: ${z}, only zoom ${ZMAX} is allowed`);
    const response = NextResponse.json({ error:"Only max zoom can be claimed" }, { status:400 });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }

  console.log(`   ✅ Zoom level validated`);
  console.log(`   📥 Parsing request body...`);

  const body = await req.json().catch((error) => {
    console.error(`   ❌ Failed to parse JSON body:`, error);
    return {};
  });

  console.log(`   📋 Request body size: ${JSON.stringify(body).length} characters`);

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    console.log(`   ❌ Validation error: ${firstError?.message || 'Invalid input'}`);
    console.log(`   📝 Validation issues:`, parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`));
    const response = NextResponse.json({ error: firstError?.message || 'Invalid input' }, { status: 400 });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }

  const { prompt } = parsed.data;
  console.log(`   ✅ Prompt validated: "${prompt}" (length: ${prompt.length} chars)`);

  // Check if tile is already being processed
  console.log(`   🔍 Checking database for existing tile...`);
  const existing = await db.getTile(z, x, y);
  console.log(`   📊 Database check result:`, existing ? `status=${existing.status}, hash=${existing.hash?.slice(0,8)}...` : 'not found');

  if (existing?.status === "PENDING") {
    console.log(`   ⚠️ Tile already pending, skipping duplicate request`);
    console.log(`   📤 Returning ALREADY_PENDING response`);
    const response = NextResponse.json({ ok:true, status:"ALREADY_PENDING", message:"Tile generation already in progress" });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }

  console.log(`   🔄 Starting tile generation workflow...`);

  try {
    console.log(`   💾 Updating database: marking tile as PENDING`);
    await db.upsertTile({ z,x,y, status:"PENDING" });        // idempotent mark
    console.log(`   ✅ Database updated successfully`);

    const jobName = `gen-${z}-${x}-${y}`;
    console.log(`   📋 Enqueueing job: "${jobName}"`);
    await fileQueue.enqueue(jobName, { z,x,y,prompt }); // in-process
    console.log(`   ✅ Tile generation job enqueued and completed successfully`);

    const totalTime = Date.now() - startTime;
    console.log(`   ⏱️ Total request processing time: ${totalTime}ms`);
    console.log(`   📤 Returning ENQUEUED response`);
    console.log(`   ✨ Claim API request completed successfully\n`);

    const response = NextResponse.json({ ok:true, status:"ENQUEUED" });
    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`   ❌ Failed to enqueue tile generation for ${z}/${x}/${y} after ${totalTime}ms:`, error);

    console.log(`   🔄 Resetting tile status to EMPTY due to error`);
    try {
      await db.updateTile(z,x,y, { status:"EMPTY" });
      console.log(`   ✅ Database status reset successfully`);
    } catch (resetError) {
      console.error(`   ❌ Failed to reset database status:`, resetError);
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.log(`   🚨 Returning error response: ${errorMessage}`);
    const response = NextResponse.json({ error:"Failed to start generation", details: errorMessage }, { status:500 });
    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }
}