import { NextRequest, NextResponse } from "next/server";
import { executeService } from "@/lib/api/serviceRunner";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await executeService({
      serviceId: "prompt-builder",
      ...body
    });
    
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
