import { NextResponse } from "next/server";

import { buildHealthPayload } from "@/lib/health";

export function GET() {
  return NextResponse.json(buildHealthPayload());
}
