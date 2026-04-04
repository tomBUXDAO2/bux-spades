# Capacitor App Store Setup

Bux Spades is configured to build native iOS and Android apps using [Capacitor](https://capacitorjs.com/), which wraps your existing web app in a native shell for app store distribution.

> **Important**: Redeploy your server (`bux-spades-server.fly.dev`) after pulling the latest changes. CORS has been updated to allow the Capacitor app origin (`capacitor://localhost`).
>
> **Full deployment guide:** See [DEPLOY_APP_STORES.md](../docs/DEPLOY_APP_STORES.md) for step-by-step server deploy, testing, and store submission.

## Quick Start

```bash
# 1. Install dependencies (if not done)
npm install --legacy-peer-deps

# 2. Build web app and sync to native projects
npm run cap:sync

# 3. Open in native IDE to build/run
npm run cap:ios      # Opens Xcode (macOS only)
npm run cap:android  # Opens Android Studio
```

## Development Workflow

### After making changes to the web app

1. **Build** for native: `npm run build:cap` (relative asset paths for the WebView), then **sync**: `npx cap sync`
2. **Run** on device/simulator from Xcode or Android Studio

Or use the shortcut: `npm run cap:sync` (runs `build:cap` + syncs).

For **web / Vercel** only, use `npm run build` (root `/` asset URLs so routes like `/auth/callback` work).

### Running on device

- **iOS**: Open `ios/App/App.xcworkspace` in Xcode, select your device/simulator, then Run (⌘R)
- **Android**: Open the `android` folder in Android Studio, select your device/emulator, then Run

## Prerequisites

### iOS (macOS only)

- **Xcode** (from Mac App Store) - required for iOS builds
- **CocoaPods**: `sudo gem install cocoapods` - for iOS dependencies
- **Apple Developer Account** ($99/year) - for App Store submission

After adding iOS, run from the `ios/App` directory:
```bash
cd ios/App && pod install
```

### Android

- **Android Studio** - includes SDK and emulator
- **Java JDK 17** - required for Android builds
- **Google Play Developer Account** ($25 one-time) - for Play Store submission

## App Configuration

- **App ID**: `com.buxspades.app`
- **App Name**: Bux Spades
- **Web Dir**: `dist` (Vite build output)

Configuration is in `capacitor.config.ts`.

## Customizing Icons & Splash

Bux Spades branding is applied to both iOS and Android. To customize further:

- **iOS icon**: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (use 1024×1024 PNG)
- **iOS splash**: `ios/App/App/Assets.xcassets/Splash.imageset/`
- **Android icon**: `android/app/src/main/res/mipmap-*/` (ic_launcher_foreground.png)
- **Android splash**: `android/app/src/main/res/drawable*/splash.png`
- **Android** also uses icon background color `#1f2937` and landscape orientation

## Production Build

The app automatically uses your production backend (`https://bux-spades-server.fly.dev`) when running in the native app. No additional config needed.

To use a different server, set before building:
```
VITE_API_URL=https://your-server.com
VITE_SOCKET_URL=https://your-server.com
```

## App Store Submission

### Apple App Store

1. Open `ios/App` in Xcode
2. Set your Team and signing certificate
3. Product → Archive
4. Distribute to App Store Connect
5. Complete app metadata, screenshots, and submit for review

### Google Play Store

1. Open `android` in Android Studio
2. Build → Generate Signed Bundle (AAB)
3. Upload to Google Play Console
4. Complete store listing and submit for review

## App Store Submission Checklist

Before submitting to the stores, prepare:

### Required
- [ ] **Privacy Policy URL** – You have `/privacy-policy`; use full URL (e.g. `https://yoursite.com/privacy-policy`)
- [ ] **App icons** – 1024×1024 (iOS), 512×512 (Play Store listing)
- [ ] **Screenshots** – Per device size (see store guidelines)
- [ ] **App description** – Short and long descriptions
- [ ] **Keywords/category** – Games → Card

### iOS (App Store Connect)
- [ ] Apple Developer account ($99/year)
- [ ] Signing certificate & provisioning profile
- [ ] TestFlight for beta testing

### Android (Google Play Console)
- [ ] Google Play Developer account ($25 one-time)
- [ ] Signed AAB (Android App Bundle)
- [ ] Internal/closed testing track recommended first

## Troubleshooting

**iOS: "CocoaPods not installed"**
```bash
sudo gem install cocoapods
cd ios/App && pod install
```

**iOS: "Xcode not found"**
- Install Xcode from the Mac App Store
- Run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`

**Assets not loading**
- Ensure `npm run cap:sync` was run after building
- Check that `vite.config.ts` has `base: './'` for relative asset paths

**Socket/API connection fails on device**
- The app uses production URLs when running natively
- **Server CORS** has been updated to allow `capacitor://localhost` and `ionic://localhost` – redeploy the server for this to take effect
- Ensure your backend (bux-spades-server.fly.dev) is reachable from the device

**OAuth (Discord) login in native app**
- In-app OAuth is implemented: "Continue with Discord" opens an in-app browser; after login the app receives the token via the `buxspades://auth/callback` deep link. The server redirects to `buxspades://` when `state=capacitor` is present.
- (Web only) The OAuth redirect returns to the web URL (`bux-spades.pro/auth/callback`). When opening the app’s Login and using “Login with Discord/Facebook”, the browser may open and complete login on the web site instead of in the app.
