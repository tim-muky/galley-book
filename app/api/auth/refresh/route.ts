import { NextResponse } from "next/server";

// GAL-418: refresh proxy for the iOS Share Extension. The extension runs in a
// separate process with no Supabase client, so it can't refresh its own token.
// It POSTs its cached refresh token here; we exchange it via GoTrue and return
// a fresh session. No auth gate — the refresh token IS the credential (this is
// exactly what Supabase's own /auth/v1/token endpoint does).

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const refreshToken = (body as { refresh_token?: unknown }).refresh_token;
  if (!refreshToken || typeof refreshToken !== "string") {
    return NextResponse.json({ error: "refresh_token required" }, { status: 400 });
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );

  if (!res.ok) {
    // Refresh token expired or revoked — the caller must re-authenticate.
    return NextResponse.json({ error: "Could not refresh session" }, { status: 401 });
  }

  const data = await res.json();
  return NextResponse.json({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  });
}
