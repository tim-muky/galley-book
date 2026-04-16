import { BottomNav } from "@/components/bottom-nav";
import { FeedbackButton } from "@/components/feedback-button";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Defense-in-depth auth gate for all routes under (app)/.
// The root middleware.ts is the primary guard; this is a safety net so any
// new page added here is protected even if middleware config is ever changed.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

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
