import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-lg mx-auto pb-24">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
