import { NextResponse } from "next/server";
import { db } from "@/lib/adapters/db.file";

export async function GET(_req: Request, { params }:{params:Promise<{z:string,x:string,y:string}>}) {
  const { z: zStr, x: xStr, y: yStr } = await params;
  const z = Number(zStr), x = Number(xStr), y = Number(yStr);
  const t = await db.getTile(z,x,y);
  return NextResponse.json({
    status: t?.status ?? "EMPTY",
    hash: t?.hash ?? "EMPTY",
    updatedAt: t?.updatedAt ?? null
  });
}