# DOD Photo Uploader — Android App

Native Android app for clients to submit property photos for date-of-death appraisals.
Uploads directly to your existing Google Drive `_Client Photos` folder via the same
Cloudflare backend the website uses.

## Features

- **Camera capture** — take photos directly in the app
- **Gallery picker** — select multiple existing photos (up to 30 at once)
- **Thumbnail previews** with remove buttons
- **Progress bar** showing upload status per photo
- **Notification email** sent to orders@date-of-death.com on completion
- **Brand-matched UI** — same navy/green color scheme as the website

## How to Build

1. Open the `DODPhotoUploader` folder in **Android Studio** (Ladybug or newer)
2. Let Gradle sync (it will download dependencies automatically)
3. Connect an Android device or start an emulator
4. Click **Run** (green play button)

To build a release APK:
```
./gradlew assembleRelease
```
The APK will be at `app/build/outputs/apk/release/app-release.apk`.

## Backend Update (Required)

The existing Cloudflare backend blocks requests that don't come from `date-of-death.com`.
The app sends an `X-API-Key` header instead. You need to:

1. **Copy** `backend-update/upload-photos.js` → `functions/api/upload-photos.js` in
   your website repo
2. **Add a secret** in Cloudflare Pages dashboard:
   - Go to **Pages → your project → Settings → Environment variables**
   - Add: `UPLOAD_API_KEY` = `dod-android-upload-2026`
3. **Push** to deploy

The website's existing photo upload page continues to work exactly as before (it uses
Origin-based auth). The API key is only checked when the Origin doesn't match.

## Changing the API Key

If you want a different key:
- Update `BuildConfig.API_KEY` in `app/build.gradle.kts`
- Update the `UPLOAD_API_KEY` environment variable in Cloudflare

## Architecture

```
Client (Android)                    Cloudflare Pages Function
  ┌──────────┐   POST multipart     ┌──────────────────┐
  │ OkHttp   │ ──────────────────→  │ upload-photos.js │
  │ per-file │   X-API-Key header   │                  │
  └──────────┘                      │  ┌─ Google Drive  │
                                    │  │  (service acct) │
                                    │  ├─ Resend email   │
                                    │  └─ (on last file) │
                                    └──────────────────┘
```

Each photo is uploaded one at a time (same as the website). The first upload creates a
subfolder named after the property address under `_Client Photos`. Subsequent uploads
reuse that folder ID for speed.
