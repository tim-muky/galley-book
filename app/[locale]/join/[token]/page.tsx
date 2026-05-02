import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";
import Image from "next/image";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/join/${token}`)}`);
  }

  const service = createServiceClient();
  const { data: invite } = await service
    .from("galley_invites")
    .select("galley_id, galleys(name)")
    .eq("token", token)
    .single();

  if (!invite) {
    return <JoinError message="This invite link is invalid or has expired." />;
  }

  const galleyRow = invite.galleys as unknown as { name: string } | null;
  const galleyName = galleyRow?.name ?? "this galley";

  const { data: existing } = await supabase
    .from("galley_members")
    .select("id")
    .eq("galley_id", invite.galley_id)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    redirect(`/${locale}/library`);
  }

  const galleyId = invite.galley_id;

  async function joinGalley() {
    "use server";

    const actionSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await actionSupabase.auth.getUser();
    if (!actionUser) redirect(`/${locale}/auth/login`);

    await actionSupabase.from("galley_members").insert({
      galley_id: galleyId,
      user_id: actionUser.id,
      role: "member",
      joined_at: new Date().toISOString(),
    });

    redirect(`/${locale}/library`);
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <Image
          src="/logo.png"
          alt="galleybook"
          width={80}
          height={80}
          className="object-contain mb-8"
          priority
        />

        <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
          You&apos;re invited
        </p>
        <h1 className="text-3xl font-thin text-anthracite mb-2">
          Join {galleyName}
        </h1>
        <p className="text-sm font-light text-on-surface-variant mb-10">
          Someone has invited you to their shared recipe library on galleybook.
        </p>

        <form action={joinGalley} className="w-full space-y-3">
          <button
            type="submit"
            style={{ backgroundColor: "#252729", color: "#fff", borderColor: "#252729" }}
            className="w-full border text-sm font-light py-4 rounded-full"
          >
            Join Galley
          </button>
        </form>
      </div>
    </div>
  );
}

function JoinError({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-8">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <Image
          src="/logo.png"
          alt="galleybook"
          width={80}
          height={80}
          className="object-contain mb-8"
          priority
        />
        <p className="text-sm font-light text-on-surface-variant">{message}</p>
        <a
          href="/library"
          className="mt-6 text-sm font-light text-anthracite underline underline-offset-4"
        >
          Go to Library
        </a>
      </div>
    </div>
  );
}
