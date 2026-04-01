import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS.
 * Use ONLY in server-side code for intentionally public operations
 * (e.g. the /share/[token] page that Bring!'s scrapers access without a session).
 * Never expose this client to the browser.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
