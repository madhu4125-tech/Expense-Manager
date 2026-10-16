# My Expenses (Android)

Offline expense tracker, built as a native Android app with Capacitor.

Features: add/edit/delete transactions, pick any past date, spending-by-category summary,
week/month/all-time filter, dark mode, backup (JSON) and Excel export (CSV), restore from backup.

## Get the APK
Push to `main` -> GitHub **Actions** tab -> latest **Build Android APK** run -> download the
**expense-manager-apk** artifact -> install `app-debug.apk`.

## Edit the app
- UI: `src/index.html`
- Logic: `src/app.js`
- Icon / splash images: `assets/`
- App name: `capacitor.config.json` (`appName`)
