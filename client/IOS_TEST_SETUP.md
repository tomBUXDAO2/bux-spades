# iOS Testing on Your iPhone/iPad

Test Bux Spades on your own devices without the App Store. You'll run the app directly from Xcode.

## Prerequisites

### 1. Xcode (Required)

You need **full Xcode**, not just Command Line Tools.

- Install from Mac App Store: search "Xcode"
- Or: https://developer.apple.com/xcode/
- After installing: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`

### 2. CocoaPods

```bash
sudo gem install cocoapods
```

### 3. Apple ID

Sign in with your Apple ID in Xcode for code signing (free account works for 7-day installs).

---

## Setup & Run

### Step 1: Sync and install pods

```bash
cd /Users/tombuxdao/bux-spades/client
npm run build
npx cap sync ios
cd ios/App && pod install
```

### Step 2: Open in Xcode

```bash
open ios/App/App.xcworkspace
```

**Important:** Open `App.xcworkspace`, not `App.xcodeproj`.

### Step 3: Sign the app

1. In Xcode, select the **App** project in the left sidebar
2. Select the **App** target
3. Go to **Signing & Capabilities**
4. Check **Automatically manage signing**
5. Select your **Team** (your Apple ID – add it in Xcode → Settings → Accounts if needed)
6. If you use a free Apple ID: select your **Personal Team**

### Step 4: Run on your device

1. Connect your iPhone or iPad via USB
2. Unlock the device and tap **Trust** if prompted
3. At the top of Xcode, click the device dropdown (next to the Run button) and select your iPhone or iPad
4. Click the **Run** button (▶) or press **Cmd + R**

The app will build and install on your device.

---

## Trust the developer (first time only)

If you see "Untrusted Developer" on the device:

1. On your iPhone/iPad: **Settings → General → VPN & Device Management**
2. Under "Developer App", tap your Apple ID
3. Tap **Trust**

---

## Free Apple ID limitation

With a free Apple ID, the app expires after **7 days**. To run it again, connect the device and click Run in Xcode.

For longer installs, you need an Apple Developer account ($99/year).

---

## Quick commands

```bash
# Sync web app to iOS (run after code changes)
cd client && npm run build && npx cap sync ios

# Install/update pods
cd client/ios/App && pod install

# Open Xcode
open client/ios/App/App.xcworkspace
```
