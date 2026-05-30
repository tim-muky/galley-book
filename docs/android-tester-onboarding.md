# Android tester onboarding — galleybook

How to invite a new tester to the galleybook Android internal-testing track.

**Group:** `galleybook-android-testers@googlegroups.com`
**Group URL:** <https://groups.google.com/g/galleybook-android-testers>
**Opt-in URL:** `https://play.google.com/apps/internaltest/<your-id>` *(paste actual ID once you have it)*

---

## Per-tester flow

### What the tester does (3 steps)

1. **Join the Google Group**
   - Open <https://groups.google.com/g/galleybook-android-testers>
   - Click **"Ask to join group"** — use the Google account that's on the Android phone
   - Wait for approval (Tim approves)

2. **Become a tester** (after approval)
   - Open the opt-in URL on the phone
   - Tap **"Become a tester"** — same Google account

3. **Install**
   - ~5 min later, open Play Store → search **galleybook** (or tap the install link on the same page)
   - Install → open → sign in with Google

### What Tim does

- **Approve join requests** in the Google Group (`Pending members` tab) within a day
- (Optional) reply to the new member with the invite email below

---

## Invite email template (post-approval)

```
Subject: You're in — install galleybook on Android 🍳

Hi {first name},

You're in the testers group. Two steps to install:

1. Open this link on your phone → tap "Become a tester":
   {opt-in URL}
   (use the same Google account you joined the group with)

2. Wait ~5 min, then open the Play Store → search galleybook → install → open
   → sign in with Google.

If it doesn't show in the Play Store after 10 min, force-close + reopen the Play
Store (it caches).

Feedback: just reply to this email — bugs, weirdness, missing stuff, anything.

Thanks!
Tim
```

---

## One-time setup checklist

- [ ] Google Group `galleybook-android-testers@googlegroups.com` set to **"Ask to join"** (testers self-request, Tim approves)
- [ ] Play Console → galleybook app → **Test and release → Testing → Internal testing → Testers** → add the group's email address to the email list
- [ ] First AAB shipped to **Internal testing** track:
  ```bash
  eas build --platform android --profile production --auto-submit
  ```
  *(or whichever EAS profile points at the `internal` track in `eas.json`)*
- [ ] Opt-in URL grabbed from Play Console → paste it into the email template above

---

## Common gotchas

- **"Not eligible" on the opt-in page** → the tester's Google account isn't in the group yet (or join request not approved).
- **Not in Play Store after 10 min** → wrong Google account on the device, or Play Store cache → force-close + reopen the Play Store.
- **Group join URL must match the account on the phone** → if a tester uses a different Google account on Play Store than the one they used to join the group, opt-in won't work.
- **Updates** → new EAS build to the internal track is enough; testers auto-update via Play Store.

---

## Test device

galleybook Android dev/test is on a **Motorola moto g56 5G** (Android 15, My UX) — see [memory/project_android_test_device.md](../../.claude/projects/.../memory/project_android_test_device.md). The Build-number toggle for Developer Options lives under **About phone → Device identifiers** on My UX (not on the About phone screen directly).
