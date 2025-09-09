import { NextResponse } from "next/server";
import { db } from "@/lib/adapters/db.file";

export async function GET(_req: Request, { params }:{params:Promise<{z:string,x:string,y:string}>}) {
  const { z: zStr, x: xStr, y: yStr } = await params;
  const z = Number(zStr), x = Number(xStr), y = Number(yStr);
  const t = await db.getTile(z,x,y);

  const response = NextResponse.json({
    status: t?.status ?? "EMPTY",
    hash: t?.hash ?? "EMPTY",
    updatedAt: t?.updatedAt ?? null
  });

  // Add CORS headers
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  return response;
}