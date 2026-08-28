# Mobile app launch status (pause note)

**Last updated:** 29 Aug 2026  
**Context:** Pausing store builds to work on product features; resume mobile from here.

Related guides: [DEPLOY_APP_STORES.md](./DEPLOY_APP_STORES.md), [client/MOBILE_SETUP.md](../client/MOBILE_SETUP.md), [client/IOS_TEST_SETUP.md](../client/IOS_TEST_SETUP.md).

---

## Facebook Login (blocks public mobile auth story)

| Step | Status |
|------|--------|
| Business Verification (legal name: Thomas James Garner / portfolio Buxdao) | Done |
| App **Published** | Done |
| `public_profile` Advanced Access | **Submitted — review in progress** (Meta: often within ~20 days) |
| Public FB login for non–app-role users | **Blocked until Advanced Access approved** |
| Workaround | Add people as **App roles → Tester** so they can log in during review |

OAuth uses `public_profile` only (no `email`). Callback: `https://bux-spades-server.fly.dev/api/auth/facebook/callback`. App ID: `1274380158070452`.

**Note:** When shipping iOS App Store with third-party login, Apple will require **Sign in with Apple**.

---

## Android / Google Play

| Step | Status |
|------|--------|
| Capacitor Android project | Present under `client/android` |
| Debug APK built | Yes — `client/android/app/build/outputs/apk/debug/app-debug.apk` (share via Diawi etc.) |
| Play Console account (BUXDAO) | Identity verification **submitted** |
| Device / phone verify in Play setup | **Still outstanding** (last known) |
| Signed release AAB | **Not done** |
| Internal testing / production listing | **Not started** |

**Resume next:** Finish Play Console identity/setup → create upload keystore → signed AAB → Internal testing track.

---

## iOS / App Store

| Step | Status |
|------|--------|
| Machine | iMac: **macOS 12.7.4**, **Xcode 14.2** |
| Capacitor | Downgraded **6 → 5.7.8** so project builds on Xcode 14 |
| CocoaPods | Fragile on system Ruby 2.6; Pods were patched manually for Cap 5 paths + `WKWebView+Capacitor.h` |
| App icon | 1024×1024 `AppIcon-1024.png` added |
| Simulator | **Works** |
| Physical iPhone | **Blocked** — device iOS newer than Xcode 14.2 device support |
| App Store submit from this Mac | **Not possible** — need newer macOS + **Xcode 26+** (Apple’s current requirement as of early 2026) |

**Resume options:**

1. **Preferred:** Apple Silicon Mac (16GB RAM min, 512GB SSD; M2/M3 better), current Xcode → Cap can move back toward current major → TestFlight / App Store.
2. Cloud Mac CI (MacStadium, GitHub macOS runners, etc.) if no new hardware yet.
3. Keep Cap 5 + simulator-only testing on the iMac until then.

---

## Code / repo note when paused

Uncommitted Cap 5 + iOS icon work should be committed before feature work so the pause state is recoverable. Android debug APK is a local build artifact (not committed).

---

## Suggested resume order

1. Meta approves `public_profile` Advanced Access → verify GF / non-admin FB login on web.
2. Android: finish Play Console → signed AAB → Internal testing.
3. iOS: new Mac/Xcode (or CI) → bump tooling as needed → Sign in with Apple → TestFlight.
