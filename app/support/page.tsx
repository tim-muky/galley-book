import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support — galleybook",
};

export default function SupportPage() {
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

        <h1 className="text-4xl font-thin text-anthracite mb-2">Support</h1>
        <p className="text-sm font-light text-on-surface-variant mb-10">
          We&apos;re a small team. Email us at{" "}
          <a href="mailto:contact@galleybook.com" className="underline underline-offset-2">
            contact@galleybook.com
          </a>{" "}
          and we&apos;ll usually reply within 1–2 business days.
        </p>

        {/* Quick links */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-3">
            Quick links
          </h2>
          <div className="space-y-2">
            <a
              href="https://apps.apple.com/account/subscriptions"
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-surface-low rounded-md px-4 py-3 text-sm font-light text-anthracite"
            >
              Manage or cancel your subscription →
            </a>
            <Link
              href="/settings"
              className="block bg-surface-low rounded-md px-4 py-3 text-sm font-light text-anthracite"
            >
              Account & galley settings →
            </Link>
            <Link
              href="/privacy"
              className="block bg-surface-low rounded-md px-4 py-3 text-sm font-light text-anthracite"
            >
              Privacy policy →
            </Link>
            <Link
              href="/terms"
              className="block bg-surface-low rounded-md px-4 py-3 text-sm font-light text-anthracite"
            >
              Terms of service →
            </Link>
          </div>
        </section>

        {/* FAQs */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold text-anthracite uppercase tracking-widest mb-4">
            Common questions
          </h2>

          <div className="space-y-6">
            <div>
              <p className="text-sm font-semibold text-anthracite mb-1">
                How do I cancel my galleybook premium subscription?
              </p>
              <p className="text-sm font-light text-on-surface-variant leading-relaxed">
                Subscriptions are managed by Apple. On your iPhone open{" "}
                <em>Settings → your name → Subscriptions → galleybook</em>, then tap{" "}
                <em>Cancel Subscription</em>. You&apos;ll keep premium until the end of the current
                billing period. You can also reach the same screen from Settings → Subscription
                inside the app.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-anthracite mb-1">
                Can I get a refund?
              </p>
              <p className="text-sm font-light text-on-surface-variant leading-relaxed">
                Refunds for App Store purchases are handled by Apple, not by us. Request a refund
                at{" "}
                <a
                  href="https://reportaproblem.apple.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  reportaproblem.apple.com
                </a>
                . If Apple declines and you believe something was wrong on our end, email us and
                we&apos;ll do what we can.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-anthracite mb-1">
                A recipe import didn&apos;t work — what can I do?
              </p>
              <p className="text-sm font-light text-on-surface-variant leading-relaxed">
                galleybook uses AI to extract recipes from Instagram, TikTok, YouTube, and most
                recipe websites. Some sites block automated access, and short-form video without
                a written caption can be hard to parse. Try the same recipe from a different
                source if possible, or paste the ingredients into the manual editor. If a
                specific URL keeps failing, please email us the link so we can investigate.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-anthracite mb-1">
                How do I invite family members to my galley?
              </p>
              <p className="text-sm font-light text-on-surface-variant leading-relaxed">
                Open Settings → Galley → Invite, copy the invite link, and share it with the
                people you want to add. They sign in with Google or Apple and are added
                automatically.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-anthracite mb-1">
                How do I delete my account?
              </p>
              <p className="text-sm font-light text-on-surface-variant leading-relaxed">
                Open{" "}
                <Link href="/settings" className="underline underline-offset-2">
                  Settings
                </Link>{" "}
                and tap <em>Delete Account</em>. Your personal data, recipes in your own galley,
                and uploaded photos are deleted immediately. Recipes you created in a galley owned
                by someone else stay in that galley but are detached from your name.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-anthracite mb-1">
                How is Family Sharing handled?
              </p>
              <p className="text-sm font-light text-on-surface-variant leading-relaxed">
                galleybook premium supports Apple Family Sharing. Members of your Apple family
                group automatically share your subscription on their own devices once they sign
                in to galleybook. Premium access is also shared across all members of a galley,
                so anyone you invite gets premium features within that galley while your
                subscription is active.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-anthracite mb-1">
                I forgot which account I signed in with.
              </p>
              <p className="text-sm font-light text-on-surface-variant leading-relaxed">
                galleybook uses Sign in with Google or Sign in with Apple — there is no
                password. If you&apos;re not sure which one you used, try both on the sign-in
                screen. Sign in with Apple may use an Apple-relayed email
                (e.g. <em>xyz@privaterelay.appleid.com</em>) rather than your real address.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-anthracite mb-1">
                I&apos;d like to report a bug or request a feature.
              </p>
              <p className="text-sm font-light text-on-surface-variant leading-relaxed">
                Use the feedback button in the app (above the bottom navigation), or email us at{" "}
                <a href="mailto:contact@galleybook.com" className="underline underline-offset-2">
                  contact@galleybook.com
                </a>
                . Please include your device model, iOS version, and a screenshot if you can.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="pt-8 border-t border-surface-low">
          <p className="text-xs font-light text-on-surface-variant">
            See also our{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>{" "}
            and{" "}
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
