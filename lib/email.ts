import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "Galley Book <waiter@galleybook.com>";
const NOTIFY_EMAIL = "tim@muky-kids.com";

export async function sendWaitlistConfirmation(email: string) {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "You're on the list — Galley Book",
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; color: #252729;">
        <p style="font-size: 1.75rem; font-weight: 300; margin-bottom: 1rem;">You're on the list.</p>
        <p style="font-size: 0.875rem; font-weight: 300; line-height: 1.6; color: #474747;">
          Thanks for signing up for Galley Book — a private recipe library for the people you cook for.
          We'll reach out as soon as your spot is ready.
        </p>
        <p style="font-size: 0.875rem; font-weight: 300; color: #474747; margin-top: 2rem;">
          — The Galley Book team
        </p>
      </div>
    `,
  });
}

export async function notifyWaitlistSignup(email: string) {
  await resend.emails.send({
    from: FROM,
    to: NOTIFY_EMAIL,
    subject: `New waitlist signup: ${email}`,
    html: `<p style="font-family: Inter, sans-serif;">${email} joined the waitlist.</p>`,
  });
}

export async function sendGalleyInvite({
  inviterName,
  galleyName,
  inviteUrl,
  toEmail,
}: {
  inviterName: string;
  galleyName: string;
  inviteUrl: string;
  toEmail: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${inviterName} invited you to ${galleyName}`,
    html: `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; color: #252729;">
        <p style="font-size: 1.75rem; font-weight: 300; margin-bottom: 1rem;">You've been invited.</p>
        <p style="font-size: 0.875rem; font-weight: 300; line-height: 1.6; color: #474747;">
          <strong style="font-weight: 600;">${inviterName}</strong> invited you to join
          <strong style="font-weight: 600;">${galleyName}</strong> on Galley Book —
          a private recipe library for the people you cook for.
        </p>
        <a href="${inviteUrl}"
           style="display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem;
                  background: #252729; color: #fff; border-radius: 9999px;
                  font-size: 0.875rem; font-weight: 300; text-decoration: none;">
          Accept invite
        </a>
        <p style="font-size: 0.75rem; font-weight: 300; color: #474747; margin-top: 2rem;">
          Or copy this link: ${inviteUrl}
        </p>
      </div>
    `,
  });
}
