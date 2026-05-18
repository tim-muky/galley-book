import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Account deletion — galleybook",
  description: "How to delete your galleybook account and the data associated with it.",
};

export default function AccountDeletionPage() {
  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-light text-on-surface-variant mb-10"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11L5 7l4-4" stroke="#474747" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to galleybook
        </Link>

        <h1 className="text-4xl font-thin text-anthracite mb-2">Delete your galleybook account</h1>
        <p className="text-xs font-light text-on-surface-variant mb-10">
          Last updated: May 17, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            From inside the app
          </h2>
          <p className="text-sm font-light text-anthracite leading-relaxed mb-3">
            The fastest way to delete your account and all associated data is from inside galleybook
            on iOS or Android:
          </p>
          <ol className="list-decimal list-inside text-sm font-light text-anthracite leading-relaxed space-y-1">
            <li>Open <strong>galleybook</strong> and sign in.</li>
            <li>Tap the <strong>Settings</strong> tab (bottom-right).</li>
            <li>Scroll to <strong>Account</strong> and tap <strong>Delete account</strong>.</li>
            <li>Confirm the deletion.</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            If you can&apos;t sign in
          </h2>
          <p className="text-sm font-light text-anthracite leading-relaxed">
            Email us at <a href="mailto:support@galleybook.com" className="underline">support@galleybook.com</a> from
            the address associated with your account. Include the email you signed in with and any
            galley names you remember. We will verify ownership and delete the account within 7 working
            days.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            What gets deleted
          </h2>
          <p className="text-sm font-light text-anthracite leading-relaxed mb-3">
            Deleting your account permanently removes:
          </p>
          <ul className="list-disc list-inside text-sm font-light text-anthracite leading-relaxed space-y-1">
            <li>Your profile (name, email, avatar)</li>
            <li>Any galleys you own, including every recipe, photo, ingredient list, and step in them</li>
            <li>Your membership in galleys owned by others (the galley itself is not deleted; the owner keeps it)</li>
            <li>Your cook-next list, votes, and recommendation history</li>
            <li>Recipe photos you uploaded</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            What is retained (and for how long)
          </h2>
          <ul className="list-disc list-inside text-sm font-light text-anthracite leading-relaxed space-y-1">
            <li>
              <strong>Subscription receipts</strong> — purchase records (Apple App Store / Google Play
              transaction IDs and expiry dates) are kept for up to <strong>10 years</strong> to satisfy
              tax and accounting obligations under German law. No personal content is included in these
              records.
            </li>
            <li>
              <strong>Anonymous usage logs</strong> — aggregate counters (recipes parsed, AI calls)
              with no personal identifiers are kept indefinitely for product analytics.
            </li>
            <li>
              <strong>Encrypted backups</strong> — automatic database backups expire on a rolling
              30-day window. Your data is fully gone from those after at most 30 days post-deletion.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            Cancelling subscriptions
          </h2>
          <p className="text-sm font-light text-anthracite leading-relaxed">
            Deleting your galleybook account does <strong>not</strong> automatically cancel an active
            paid subscription. Cancel from the store you bought it on:
          </p>
          <ul className="list-disc list-inside text-sm font-light text-anthracite leading-relaxed space-y-1 mt-2">
            <li>
              <strong>Apple App Store</strong> — Settings → [Your Apple ID] → Subscriptions
            </li>
            <li>
              <strong>Google Play</strong> — Play Store app → Profile → Payments &amp; subscriptions
              → Subscriptions
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            Contact
          </h2>
          <p className="text-sm font-light text-anthracite leading-relaxed">
            galleybook is operated by Tim Meyerdierks. Questions about deletion or data
            handling? <a href="mailto:support@galleybook.com" className="underline">support@galleybook.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
