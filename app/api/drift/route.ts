import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { loadGrayFloatFromBuffer, phaseCorrelationShift } from "@/lib/drift";

function toBuffer(file: File): Promise<Buffer> {
  return file.arrayBuffer().then(ab => Buffer.from(ab));
}

function pow2Floor(n: number): number {
  let p = 1;
  while ((p << 1) <= n) p <<= 1;
  return p;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const fa = form.get("a");
    const fb = form.get("b");
    if (!(fa instanceof File) || !(fb instanceof File)) {
      return NextResponse.json({ error: "Upload two files named 'a' and 'b'" }, { status: 400 });
    }

    const [bufA, bufB] = await Promise.all([toBuffer(fa), toBuffer(fb)]);
    const metaA = await sharp(bufA).metadata();
    const metaB = await sharp(bufB).metadata();
    if (!metaA.width || !metaA.height || !metaB.width || !metaB.height) {
      return NextResponse.json({ error: "Invalid images" }, { status: 400 });
    }

    const minSize = Math.min(metaA.width, metaA.height, metaB.width, metaB.height);
    const size = pow2Floor(minSize); // ensure power-of-two for FFT
    if (size < 8) return NextResponse.json({ error: "Images too small" }, { status: 400 });

    const aCrop = await sharp(bufA).extract({
      left: Math.floor(((metaA.width as number) - size) / 2),
      top: Math.floor(((metaA.height as number) - size) / 2),
      width: size,
      height: size,
    }).png().toBuffer();
    const bCrop = await sharp(bufB).extract({
      left: Math.floor(((metaB.width as number) - size) / 2),
      top: Math.floor(((metaB.height as number) - size) / 2),
      width: size,
      height: size,
    }).png().toBuffer();

    const A = await loadGrayFloatFromBuffer(aCrop);
    const B = await loadGrayFloatFromBuffer(bCrop);
    const { dx, dy, peakValue } = phaseCorrelationShift(A.pixels, B.pixels, size, size);

    return NextResponse.json({ dy, dx, rightwardPixels: Math.round(dx), width: size, height: size, peakValue });
  } catch (err: any) {
    console.error("/api/drift error:", err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

