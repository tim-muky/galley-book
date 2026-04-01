"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-12">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#252729] flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M7 8h14M7 14h10M7 20h7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-thin tracking-widest text-anthracite uppercase">
            Galley Book
          </h1>
          <p className="text-sm font-light text-on-surface-variant text-center">
            Your family&apos;s recipe collection
          </p>
        </div>

        {/* Sign in */}
        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 bg-[#252729] text-white font-light text-sm rounded-full py-4 px-6 transition-opacity hover:opacity-80 active:opacity-70"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="white"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#e0e0e0"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#c0c0c0"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#a0a0a0"/>
          </svg>
          Continue with Google
        </button>

        <p className="text-xs font-light text-on-surface-variant text-center leading-relaxed">
          By continuing, you agree to Galley Book&apos;s<br />
          terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}
