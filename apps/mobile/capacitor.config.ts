import type { CapacitorConfig } from "@capacitor/cli";

// One-time Android setup:
//   cd apps/mobile
//   npm install
//   npm run build          (produces dist/)
//   npx cap add android    (generates android/ — commit it)
//   npx cap sync android
//
// Google Drive OAuth:
//   Create an Android OAuth client in Google Cloud Console.
//   Add the SHA-1 of your signing key (debug: `keytool -list -v -keystore ~/.android/debug.keystore`).
//   Place google-services.json in apps/mobile/android/app/.
//   Set serverClientId below to your Web client ID.

const config: CapacitorConfig = {
  appId: "net.approximator.paranalyzer",
  appName: "Paranalyzer",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
  plugins: {
    GoogleAuth: {
      scopes: ["https://www.googleapis.com/auth/drive.appdata"],
      // Replace with your Web OAuth client ID from Google Cloud Console:
      serverClientId: "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com",
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
