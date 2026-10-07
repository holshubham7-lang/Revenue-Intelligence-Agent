import { NextResponse } from "next/server";
import locations from "countrycitystatejson";

export const runtime = "nodejs";

export function GET(request: Request) {
  const country = new URL(request.url).searchParams.get("country")?.toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country)) {
    return NextResponse.json({ error: "A valid country code is required." }, { status: 400 });
  }

  const states = locations.getStatesByShort(country) ?? [];
  return NextResponse.json(
    { states: [...new Set(states)].sort((a, b) => a.localeCompare(b)) },
    { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
