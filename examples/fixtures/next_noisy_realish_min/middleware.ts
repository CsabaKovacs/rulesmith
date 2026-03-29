import { NextResponse } from "next/server";

export function middleware() {
  return NextResponse.redirect(new URL("/login", "https://example.test"));
}
