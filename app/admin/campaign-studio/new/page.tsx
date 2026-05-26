import { requireAdmin } from "@/lib/auth/admin";
import Link from "next/link";
import { NewRunForm } from "./new-run-form";

export const dynamic = "force-dynamic";

export default async function NewRunPage() {
  await requireAdmin();

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Link
          href="/admin/campaign-studio"
          className="text-xs font-light text-on-surface-variant"
        >
          ← Studio
        </Link>
      </div>
      <h1 className="text-4xl font-thin text-anthracite mb-1">New Galley of the Week</h1>
      <p className="text-xs font-light text-on-surface-variant mb-8">
        Set the brief. We generate 10 recipe candidates for you to curate.
      </p>

      <NewRunForm />
    </div>
  );
}
