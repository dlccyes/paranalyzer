import type { CapacitorConfig } from "@capacitor/cli";

// One-time Android setup:
//   cd apps/mobile
//   npm install
//   npm run build          (produces dist/)
//   npx cap add android    (generates android/ — commit it)
//   npx cap sync android
//
// Google Drive OAuth:
//   Enable the Google Drive API in the Google Cloud project.
//   Configure the OAuth consent screen with the drive.appdata scope.
//   Create an Android OAuth client for appId + signing-key SHA-1.
//   Set androidClientId below to that Android OAuth client ID.

const config: CapacitorConfig = {
  appId: "net.approximator.paranalyzer",
  appName: "Paranalyzer",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
  plugins: {
    GoogleAuth: {
      scopes: ["profile", "email", "https://www.googleapis.com/auth/drive.appdata"],
      androidClientId: "793792702856-8p3th1ignl975cl0132obqcfko3lgfrs.apps.googleusercontent.com",
      forceCodeForRefreshToken: false,
    },
  },
};

export default config;
