import { NextRequest, NextResponse } from "next/server";
import { generateAllParentTiles } from "@/lib/parentTiles";

export async function POST(req: NextRequest) {
  console.log("🔄 Parent tile generation requested");
  
  try {
    // Run generation asynchronously
    generateAllParentTiles().catch(console.error);
    
    return NextResponse.json({ 
      ok: true, 
      message: "Parent tile generation started in background" 
    });
  } catch (error) {
    console.error("Failed to start parent generation:", error);
    return NextResponse.json({ 
      error: "Failed to start parent generation",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}