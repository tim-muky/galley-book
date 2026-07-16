import { redirect } from "next/navigation";

// Android is live on Google Play (GAL-443). This route previously hosted the
// closed-testing interstitial (join-the-waitlist + become-a-tester). It's kept
// only so old links, QR codes, and the launch email to android_waitlist
// signups still resolve — it now redirects straight to the Play Store listing.
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.galleyworks.galleybook";

export default function AndroidPage() {
  redirect(PLAY_URL);
}
