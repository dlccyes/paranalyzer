import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const pluginPath = join(
  process.cwd(),
  "node_modules/@codetrix-studio/capacitor-google-auth/android/src/main/java/com/codetrixstudio/capacitor/GoogleAuth/GoogleAuth.java",
);

let source;
try {
  source = readFileSync(pluginPath, "utf8");
} catch {
  process.exit(0);
}

if (source.includes("private String requestedTokenScope = \"oauth2:profile email\";")) {
  process.exit(0);
}

const patched = source
  .replace(
    "  private GoogleSignInClient googleSignInClient;\n",
    "  private GoogleSignInClient googleSignInClient;\n  private String requestedTokenScope = \"oauth2:profile email\";\n",
  )
  .replace(
    "    loadSignInClient(clientId, forceCodeForRefreshToken, scopeArray);\n",
    "    requestedTokenScope = \"oauth2:\" + String.join(\" \", scopeArray);\n    loadSignInClient(clientId, forceCodeForRefreshToken, scopeArray);\n",
  )
  .replace(
    '    AccountManagerFuture<Bundle> future = manager.getAuthToken(account, "oauth2:profile email", null, false, null, null);\n',
    "    AccountManagerFuture<Bundle> future = manager.getAuthToken(account, requestedTokenScope, null, false, null, null);\n",
  );

if (patched === source) {
  throw new Error("Could not patch @codetrix-studio/capacitor-google-auth Android token scopes");
}

writeFileSync(pluginPath, patched);
