import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Galley Book",
};

export default function TermsPage() {
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

        <h1 className="text-4xl font-thin text-anthracite mb-2">Terms of Service</h1>
        <p className="text-xs font-light text-on-surface-variant mb-10">
          Last updated: April 7, 2026
        </p>

        {/* 1. Acceptance */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            1. Acceptance
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            By creating an account or using Galley Book, you agree to these Terms of Service. If you
            do not agree, please do not use the app.
          </p>
        </section>

        {/* 2. Personal and family use */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            2. Personal and Family Use Only
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            Galley Book is intended for personal and household use — for example, to manage a shared
            family recipe collection.
          </p>
          <ul className="list-disc list-outside ml-5 space-y-2 text-sm font-light text-on-surface-variant">
            <li>You may not use Galley Book for commercial purposes.</li>
            <li>You may not resell, redistribute, or sublicence access to the service.</li>
            <li>
              You may not use automated scripts, bots, or scrapers against the service without prior
              written permission.
            </li>
          </ul>
        </section>

        {/* 3. Your content */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            3. Your Content
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            You retain ownership of the recipes, photos, and other content you add to Galley Book.
            By uploading content, you grant us a limited, non-exclusive licence to store and display
            it within the app solely to operate the service for you and your galley members.
          </p>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            You are responsible for ensuring you have the right to upload any content you add. We do
            not claim ownership over recipes sourced from third parties.
          </p>
        </section>

        {/* 4. AI-assisted features */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            4. AI-Assisted Features
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            Galley Book uses third-party AI services to power recipe import and recommendations:
          </p>
          <ul className="list-disc list-outside ml-5 space-y-2 text-sm font-light text-on-surface-variant">
            <li>
              When you import a recipe via URL, the content of that page is sent to{" "}
              <strong className="font-normal text-anthracite">Anthropic Claude</strong> and/or{" "}
              <strong className="font-normal text-anthracite">Perplexity AI</strong> for processing.
            </li>
            <li>
              When you import a recipe via photo, the image is sent to{" "}
              <strong className="font-normal text-anthracite">Anthropic Claude</strong>.
            </li>
            <li>
              When you use the Discover feature, metadata from your recipe collection and saved
              sources is sent to{" "}
              <strong className="font-normal text-anthracite">Perplexity AI</strong>.
            </li>
            <li>
              AI-extracted recipe content may be incomplete or inaccurate. Always review results
              before saving.
            </li>
            <li>By using these features you consent to the relevant data being sent to the AI providers listed above.</li>
          </ul>
        </section>

        {/* 5. Third-party content */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            5. Third-Party Content
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            Recipes imported from external websites, Instagram, YouTube, or other sources may be
            protected by copyright. Galley Book provides import tools for personal convenience — it
            is your responsibility to respect the intellectual property rights of original creators.
            We are not liable for any copyright infringement arising from content you import.
          </p>
        </section>

        {/* 6. Limitation of liability */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            6. Limitation of Liability
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed mb-3">
            Galley Book is provided &ldquo;as is&rdquo; without warranty of any kind, express or implied. To the
            fullest extent permitted by law:
          </p>
          <ul className="list-disc list-outside ml-5 space-y-2 text-sm font-light text-on-surface-variant">
            <li>We do not guarantee the accuracy of AI-parsed recipe content.</li>
            <li>
              We are not liable for data loss. We recommend keeping your own copies of important
              recipes.
            </li>
            <li>
              We are not liable for any indirect, incidental, or consequential damages arising from
              your use of the app.
            </li>
          </ul>
        </section>

        {/* 7. Account deletion */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            7. Account Deletion
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            You may delete your account at any time from{" "}
            <Link href="/settings" className="underline underline-offset-2">
              Settings
            </Link>
            . Your personal data and your own recipes will be deleted immediately. If you created
            recipes in a galley owned by another user, your name will be removed from those recipes
            but the recipes themselves will remain in the galley.
          </p>
        </section>

        {/* 8. Service availability */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            8. Service Availability
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            We aim to keep Galley Book available but cannot guarantee uninterrupted access. We may
            modify, suspend, or discontinue the service at any time. We will provide reasonable
            notice where possible.
          </p>
        </section>

        {/* 9. Changes */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            9. Changes to These Terms
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            We may update these terms from time to time. We will update the &ldquo;Last updated&rdquo; date at
            the top of this page. Continued use of the app after changes constitutes acceptance of
            the updated terms.
          </p>
        </section>

        {/* 10. Contact */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            10. Contact
          </h2>
          <p className="text-sm font-light text-on-surface-variant leading-relaxed">
            Questions about these terms? Contact us at{" "}
            <a href="mailto:contact@galleybook.com" className="underline underline-offset-2">
              contact@galleybook.com
            </a>
            .
          </p>
        </section>

        {/* Footer */}
        <div className="pt-8 border-t border-surface-low">
          <p className="text-xs font-light text-on-surface-variant">
            Also see our{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
