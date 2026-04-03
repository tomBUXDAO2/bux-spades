# Deploy to App Stores – Step-by-Step Guide

> **Quick iOS testing:** See [client/IOS_TEST_SETUP.md](client/IOS_TEST_SETUP.md) to run on your iPhone/iPad without the App Store.

## 1. Deploy the Server (Required First)

The server has CORS and OAuth updates for the native app. Deploy before testing:

```bash
cd server
fly deploy
```

Or from the project root:

```bash
cd server && fly deploy
```

Verify: Visit `https://bux-spades-server.fly.dev/health` – should return `{"status":"ok"}`.

---

## 2. Test with APK (Share Without Store)

Build a debug APK to share via link (e.g. [diawi.com](https://diawi.com)):

**Requires Java 17** (`brew install --cask zulu@17`) and **Android SDK**. Easiest: install [Android Studio](https://developer.android.com/studio) – it installs the SDK to `~/Library/Android/sdk`. If the build fails with "SDK location not found", create `client/android/local.properties` with: `sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk`

```bash
npm run apk:debug
```

**Or use Android Studio:** Open `client/android` → Build → Build Bundle(s) / APK(s) → Build APK(s)

APK output: `client/android/app/build/outputs/apk/debug/app-debug.apk`

1. Upload the APK to [diawi.com](https://diawi.com)
2. Share the generated link – testers open on Android and install
3. They may need to enable "Install unknown apps" for their browser

---

## 3. Build & Sync the Native Apps

```bash
cd client
npm run cap:sync
```

This builds the web app and copies it into the iOS and Android projects.

---

## 4. Test on Device

### Android

1. Open `client/android` in Android Studio
2. Connect a device or start an emulator
3. Click Run (green play button)
4. Test:
   - Discord login
   - Create/join game
   - Full game flow

### iOS (requires macOS)

1. Install CocoaPods: `sudo gem install cocoapods`
2. Run: `cd client/ios/App && pod install`
3. Open `client/ios/App/App.xcworkspace` in Xcode
4. Select your device/simulator, then Run (⌘R)
5. Test the same flows as Android

---

## 5. App Store Submission

### Apple App Store

**Prerequisites:**
- Apple Developer account ($99/year)
- Mac with Xcode

**Important:** If your app offers third-party login (Discord, Facebook), Apple requires **Sign in with Apple** as an option. Add it in Xcode → Signing & Capabilities → + Capability → Sign in with Apple. Implement it before submission or Apple may reject the app.

**Steps:**
1. Open `client/ios/App/App.xcworkspace` in Xcode
2. Select the App target → Signing & Capabilities
3. Choose your Team and enable automatic signing
4. Product → Archive
5. Distribute App → App Store Connect → Upload
6. In [App Store Connect](https://appstoreconnect.apple.com):
   - Create app if needed
   - Fill metadata, screenshots, description
   - Submit for review

**Screenshots:** 6.7", 6.5", 5.5" (iPhone), 12.9" (iPad) – required sizes vary.

### Google Play Store

**Prerequisites:**
- Google Play Developer account ($25 one-time)

**Steps:**
1. Open `client/android` in Android Studio
2. Build → Generate Signed Bundle / APK → Android App Bundle
3. **Create a keystore** (first time only): Key store path → Create new → Choose location and password. Use a strong password and store it securely – you need it for all future updates.
4. Build the AAB
5. In [Google Play Console](https://play.google.com/console):
   - Create app
   - Upload AAB to Production or Internal testing
   - Complete store listing (screenshots, description, etc.)
   - Submit for review

**Screenshots:** Phone, 7" tablet, 10" tablet – at least 2 per form factor.

---

## 6. Pre-Submission Checklist

| Item | Status |
|------|--------|
| Server deployed with CORS + OAuth updates | |
| App tested on real device | |
| Privacy policy URL (e.g. https://www.bux-spades.pro/privacy) | |
| 1024×1024 app icon (iOS) | |
| 512×512 app icon (Play Store listing) | |
| Screenshots for all required device sizes | |
| App description (short + long) | |
| Age rating questionnaire completed | |

---

## 7. Version Management

When releasing updates, bump versions in:

| Platform | File | Fields |
|----------|------|--------|
| Android | `client/android/app/build.gradle` | `versionCode` (integer, increment each release), `versionName` (e.g. "1.1.0") |
| iOS | Xcode → App target → General | Version, Build number |

`versionCode` (Android) and Build number (iOS) must increase with every store upload.

---

## 8. Useful Commands

```bash
# Deploy server to Fly.io
npm run deploy:server

# Build shareable APK (no store needed)
npm run apk:debug

# Build and sync native apps
npm run cap:sync

# Open native projects
npm run cap:ios      # Xcode (macOS)
npm run cap:android  # Android Studio
```
