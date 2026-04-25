import { BottomNav } from "@/components/bottom-nav";
import { FeedbackButton } from "@/components/feedback-button";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const locale = await getLocale();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-lg mx-auto pb-24">
        {children}
      </main>
      <BottomNav />
      <FeedbackButton />
    </div>
  );
}
