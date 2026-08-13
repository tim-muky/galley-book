import { redirect } from "next/navigation";

// Android is live on Google Play (GAL-443). This route previously hosted the
// closed-testing interstitial (join-the-waitlist + become-a-tester). It's kept
// only so old links and printed QR codes still resolve — it now redirects
// straight to the Play Store listing.
//
// The android_waitlist table it used to feed was dropped in migration 070: it
// held zero rows, so the launch email that step existed for had no recipients.
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.galleyworks.galleybook";

export default function AndroidPage() {
  redirect(PLAY_URL);
}
