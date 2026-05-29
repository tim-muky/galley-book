import { requireAdmin } from "@/lib/auth/admin";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireAdmin();
  return <ImportClient />;
}
