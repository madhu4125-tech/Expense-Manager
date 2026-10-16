# Expense Manager (Android)

Offline daily expense tracker. Web app wrapped as a native Android app using Capacitor.
Data is stored on the device (localStorage).

## Get the APK (no local setup needed)
1. Push this repo to GitHub (branch `main`).
2. Go to the **Actions** tab -> **Build Android APK** -> open the latest run.
3. Download the **expense-manager-apk** artifact (zip), extract it, and install `app-debug.apk` on your phone
   (allow "Install unknown apps").

You can also run it manually: Actions -> Build Android APK -> **Run workflow**.

## Edit the app
All UI and logic live in `src/index.html`. Commit changes and the APK rebuilds automatically.

## Local build (optional)
```
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android   # opens Android Studio
```
