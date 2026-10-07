import { NextResponse } from "next/server";
import locations from "countrycitystatejson";

export const runtime = "nodejs";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const country = params.get("country")?.toUpperCase();
  const state = params.get("state")?.trim();
  if (!country || !/^[A-Z]{2}$/.test(country) || !state) {
    return NextResponse.json({ error: "A valid country and state are required." }, { status: 400 });
  }

  const states = locations.getStatesByShort(country) ?? [];
  if (!states.includes(state)) {
    return NextResponse.json({ cities: [] });
  }
  const cities = locations.getCities(country, state) ?? [];
  return NextResponse.json(
    { cities: [...new Set(cities)].sort((a, b) => a.localeCompare(b)) },
    { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
