# iOS Wrapper Setup — Capacitor

This is a step-by-step build guide for the iOS native shell that wraps the live myavatar.ge PWA so it can ship to the Apple App Store. The web app itself stays unchanged; only a thin `ios/` Xcode project is added.

## Prerequisites

- macOS Sonoma 14 or newer (Apple Silicon recommended)
- Xcode 15.4+ (from App Store)
- Apple Developer Account ($99/yr, individual or company)
- Node 20+ and CocoaPods (`sudo gem install cocoapods`)
- Bundle ID reserved in App Store Connect: `ge.myavatar.app`

## One-time setup

```bash
# Install Capacitor CLI globally (or use npx)
npm install -g @capacitor/cli

# In the repo root, install runtime deps locally
npm install --save @capacitor/core @capacitor/ios @capacitor/app \
  @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard \
  @capacitor/share @capacitor/browser @capacitor/preferences

# Capacitor reads the config from capacitor.config.ts (already in repo)
# Initialize iOS project
npx cap add ios

# This creates ./ios/App/ — Xcode project lives there.
# Sync the config + plugins into the native shell:
npx cap sync ios
```

## Info.plist — required privacy strings

After `npx cap add ios`, open `ios/App/App/Info.plist` and add these strings. **Apple WILL reject submissions where the camera/mic/photo strings are missing or generic.**

```xml
<key>NSCameraUsageDescription</key>
<string>MyAvatar uses the camera to capture a photo for your AI avatar.</string>

<key>NSMicrophoneUsageDescription</key>
<string>MyAvatar uses the microphone for voice input in chat and to record voice-clone samples.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>MyAvatar reads photos from your library when you choose a source image for your AI avatar.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>MyAvatar saves generated images and videos to your photo library when you tap Download.</string>

<key>NSContactsUsageDescription</key>
<!-- not used; leave key absent. -->

<!-- Allow remote-URL loading from production domain. -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <false/>
</dict>
```

Localize these strings via `InfoPlist.strings` files for `ka` and `ru` once Apple flags it (they often do).

## App icons & launch image

Capacitor uses the `ios/App/App/Assets.xcassets/AppIcon.appiconset/` directory. Generate the full Apple icon set from the marketing 1024:

```bash
# Use icon-generator tool or manually drop sized PNGs into:
# ios/App/App/Assets.xcassets/AppIcon.appiconset/
#   Icon-20.png  20x20
#   Icon-29.png  29x29
#   Icon-40.png  40x40
#   Icon-58.png  58x58 (29@2x)
#   Icon-60.png  60x60
#   Icon-76.png  76x76
#   Icon-80.png  80x80 (40@2x)
#   Icon-87.png  87x87 (29@3x)
#   Icon-120.png 120x120 (60@2x)
#   Icon-152.png 152x152 (76@2x)
#   Icon-167.png 167x167 (iPad Pro)
#   Icon-180.png 180x180 (60@3x)
#   Icon-1024.png 1024x1024 (Marketing)
```

A simple `sharp`-based generator is in `scripts/generate-ios-icons.mjs` (TODO).

## Build & test on simulator

```bash
npx cap sync ios
npx cap open ios
# Xcode opens. Pick a simulator (iPhone 15 Pro) and ⌘R to run.
```

Smoke-test in the simulator:
- App launches with black splash, then immediately renders the chat.
- Tap the avatar pill → HeyGen flow works.
- Tap the mic icon → permission prompt appears with the localised string above.
- Tap a generated image → fullscreen lightbox opens (native gesture).

## Build for TestFlight

```bash
# 1. In Xcode: Product → Archive
# 2. Window → Organizer → Distribute App → App Store Connect → Upload
# 3. After processing (~20 min), the build appears under TestFlight in
#    App Store Connect. Add internal testers (you + team) for instant access.
```

## App Store submission

Once TestFlight has been smoke-tested:

1. App Store Connect → My Apps → MyAvatar → Distribution
2. Fill in everything from `docs/app-store-submission.md` (description, keywords, privacy declaration, reviewer notes)
3. Pick the TestFlight build as the binary
4. Submit for review

Expected review time: 24–48 hours for a first submission. Common rejection causes:
- Generic privacy-string copy in Info.plist (fix with the specific strings above)
- Missing privacy URL → must point to `https://myavatar.ge/<lang>/privacy` (live since [21b0ce0]).
- Missing support URL → must point to `https://myavatar.ge/<lang>/support` (live since this commit).
- Demo account not working / out of credits → pre-provision before submitting.

## Updating the iOS shell

For most changes (UI, copy, new features), only the web is deployed. The iOS shell does NOT need re-submission because it loads the live URL.

Re-submission is required when:
- You change anything in Info.plist
- You add/remove a Capacitor plugin
- You change the app icon / launch screen
- Apple changes its required SDK version (~yearly)

For all of those:
```bash
# Bump CFBundleVersion in ios/App/App/Info.plist
npx cap sync ios
# Re-archive in Xcode → upload to TestFlight → submit for review
```
