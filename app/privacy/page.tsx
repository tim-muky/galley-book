import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — galleybook",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <Link
          href="/library"
          className="inline-flex items-center gap-2 text-xs font-light text-on-surface-variant mb-10"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11L5 7l4-4" stroke="#474747" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to app
        </Link>

        <h1 className="text-4xl font-thin text-anthracite mb-2">Privacy Policy</h1>
        <p className="text-xs font-light text-on-surface-variant mb-10">
          Last updated: April 7, 2026
        </p>

        {/* 1. Who we are */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            1. Who We Are
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            galleybook is a private recipe management app for families and households. It is operated
            as a personal project. If you have any questions about this policy or your data, please
            contact us at{" "}
            <a href="mailto:contact@galleybook.com" className="underline underline-offset-2">
              contact@galleybook.com
            </a>
            .
          </p>
        </section>

        {/* 2. Data we collect */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            2. Data We Collect
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            We collect only what is necessary to run the app:
          </p>
          <ul className="list-disc list-outside ml-5 space-y-2 text-sm font-light text-on-surface-variant">
            <li>
              <span className="font-normal text-anthracite">Account information</span> — your name,
              email address, and profile photo, provided by Google when you sign in.
            </li>
            <li>
              <span className="font-normal text-anthracite">Recipes and content</span> — recipe
              names, descriptions, ingredients, preparation steps, and photos you add or import.
            </li>
            <li>
              <span className="font-normal text-anthracite">Saved sources</span> — website URLs,
              Instagram handles, and YouTube channels you save to generate recipe recommendations.
            </li>
            <li>
              <span className="font-normal text-anthracite">Usage data</span> — standard server
              access logs (IP address, timestamps) retained by our infrastructure provider.
            </li>
            <li>
              <span className="font-normal text-anthracite">Session cookie</span> — a single
              authentication cookie that keeps you signed in. No tracking cookies are used.
            </li>
          </ul>
        </section>

        {/* 3. Third-party services */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            3. Third-Party Services We Use
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            To operate, galleybook shares data with the following processors. Each processes only
            the data described below and is bound by their own privacy policy.
          </p>
          <div className="space-y-4">
            {[
              {
                name: "Supabase",
                role: "Database, authentication, and file storage",
                data: "All app data (recipes, accounts, photos) is stored on Supabase servers.",
                region: "EU / US",
                link: "https://supabase.com/privacy",
              },
              {
                name: "Google",
                role: "Sign-in (OAuth)",
                data: "We receive your name, email, and profile photo from Google when you sign in.",
                region: "US",
                link: "https://policies.google.com/privacy",
              },
              {
                name: "Anthropic (Claude)",
                role: "AI recipe extraction",
                data: "When you import a recipe via URL or photo, the page content or image is sent to Anthropic for parsing. Anthropic may retain inputs for up to 30 days for safety monitoring.",
                region: "US",
                link: "https://www.anthropic.com/privacy",
              },
              {
                name: "Perplexity AI",
                role: "Web search for recipe content and recommendations",
                data: "When you import a recipe from certain URLs (e.g. Instagram, YouTube) or use the Discover feature, your recipe collection metadata and saved sources are sent to Perplexity to retrieve content and generate personalised recommendations.",
                region: "US",
                link: "https://www.perplexity.ai/privacy",
              },
              {
                name: "Bring! Labs",
                role: "Shopping list integration",
                data: "When you click \u201cAdd to Shopping List\u201d, a public share link for the recipe is sent to Bring!\u2019s servers so they can parse the ingredient list.",
                region: "Switzerland",
                link: "https://getbring.com/privacy",
              },
            ].map((svc) => (
              <div key={svc.name} className="bg-surface-low rounded-md px-4 py-3">
                <p className="text-sm font-semibold text-anthracite mb-0.5">
                  {svc.name}{" "}
                  <span className="font-light text-on-surface-variant">— {svc.role}</span>
                </p>
                <p className="text-xs font-light text-on-surface-variant leading-relaxed mb-1">
                  {svc.data}
                </p>
                <p className="text-[10px] font-light text-on-surface-variant/70">
                  Region: {svc.region} ·{" "}
                  <a href={svc.link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    Privacy policy
                  </a>
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. How we use your data */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            4. How We Use Your Data
          </h2>
          <ul className="list-disc list-outside ml-5 space-y-2 text-sm font-light text-on-surface-variant">
            <li>To operate and display your recipe library.</li>
            <li>To allow you to invite family members to your Galley.</li>
            <li>To power AI-assisted recipe import and personalised recommendations.</li>
            <li>
              We do <strong className="font-normal text-anthracite">not</strong> sell your data, use
              it for advertising, or share it with anyone beyond the processors listed above.
            </li>
          </ul>
        </section>

        {/* 5. Your rights */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            5. Your Rights
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            Under the GDPR and similar laws, you have the right to:
          </p>
          <ul className="list-disc list-outside ml-5 space-y-2 text-sm font-light text-on-surface-variant">
            <li>
              <span className="font-normal text-anthracite">Access</span> — request a copy of the
              personal data we hold about you.
            </li>
            <li>
              <span className="font-normal text-anthracite">Deletion (right to erasure)</span> — delete
              your account and all associated data at any time via{" "}
              <Link href="/settings" className="underline underline-offset-2">
                Settings → Delete Account
              </Link>
              .
            </li>
            <li>
              <span className="font-normal text-anthracite">Portability</span> — request a machine-readable
              export of your recipes by emailing us.
            </li>
            <li>
              <span className="font-normal text-anthracite">Correction</span> — update your name or
              username directly in Settings.
            </li>
          </ul>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mt-3">
            To exercise any right, contact{" "}
            <a href="mailto:contact@galleybook.com" className="underline underline-offset-2">
              contact@galleybook.com
            </a>
            .
          </p>
        </section>

        {/* 6. Data retention */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            6. Data Retention
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            Your data is retained for as long as your account is active. When you delete your account:
          </p>
          <ul className="list-disc list-outside ml-5 space-y-2 text-sm font-light text-on-surface-variant">
            <li>Your personal data (name, email, recipes, photos) is deleted immediately.</li>
            <li>
              Recipes you created in galleys owned by other members are anonymised (the creator
              attribution is removed) rather than deleted, so the galley is not disrupted.
            </li>
            <li>
              Supabase infrastructure backups are purged within 30 days.
            </li>
          </ul>
        </section>

        {/* 7. Cookies */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            7. Cookies
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            We use a single session cookie to keep you signed in. This cookie is essential for the
            app to function. We do not use any advertising, analytics, or tracking cookies.
          </p>
        </section>

        {/* 8. Children */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            8. Children
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            galleybook is not directed at children under 13. We do not knowingly collect personal
            data from children. If you believe a child has provided us with their data, please
            contact us to have it removed.
          </p>
        </section>

        {/* 9. Changes */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            9. Changes to This Policy
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            We may update this policy from time to time. We will update the "Last updated" date at
            the top of this page. Continued use of the app after changes constitutes acceptance.
          </p>
        </section>

        {/* Footer */}
        <div className="pt-8 border-t border-surface-low">
          <p className="text-xs font-light text-on-surface-variant">
            Also see our{" "}
            <Link href="/terms" className="underline underline-offset-2">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
