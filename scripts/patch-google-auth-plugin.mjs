import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const javaPath = join(
  process.cwd(),
  "node_modules/@codetrix-studio/capacitor-google-auth/android/src/main/java/com/codetrixstudio/capacitor/GoogleAuth/GoogleAuth.java",
);
const gradlePath = join(
  process.cwd(),
  "node_modules/@codetrix-studio/capacitor-google-auth/android/build.gradle",
);

function patchJava() {
  let source;
  try {
    source = readFileSync(javaPath, "utf8");
  } catch {
    return false;
  }

  if (source.includes("private String requestedTokenScope = \"oauth2:profile email\";")) {
    source = source
      .replace(
        "    GoogleSignInOptions.Builder googleSignInBuilder = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)\n      .requestIdToken(clientId)\n      .requestEmail();\n\n    if (forceCodeForRefreshToken) {\n      googleSignInBuilder.requestServerAuthCode(clientId, true);\n    }\n",
        "    GoogleSignInOptions.Builder googleSignInBuilder = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)\n      .requestEmail();\n\n    if (forceCodeForRefreshToken) {\n      googleSignInBuilder.requestIdToken(clientId);\n      googleSignInBuilder.requestServerAuthCode(clientId, true);\n    }\n",
      );
    if (source.includes("String configAndroidClientId = getConfig().getString(\"androidClientId\"")) {
      const initializeMethod = `  @PluginMethod()
  public void initialize(final PluginCall call) {
    // get data from config
    String configClientId = getConfig().getString("androidClientId",
      getConfig().getString("clientId",
        this.getContext().getString(R.string.server_client_id)));
    boolean configForceCodeForRefreshToken = getConfig().getBoolean("forceCodeForRefreshToken", false);
    // need to get this as string so as to standardize with data from plugin call
    String configScopeArray = getConfig().getString("scopes", new String());

    // get client id from plugin call, fallback to be client id from config
    String clientId = call.getData().getString("clientId", configClientId);
    // get forceCodeForRefreshToken from call, fallback to be from config
    boolean forceCodeForRefreshToken = call.getData().getBoolean("grantOfflineAccess", configForceCodeForRefreshToken);
    // get scopes from call, fallback to be from config
    String scopesStr = call.getData().getString("scopes", configScopeArray);
    // replace all the symbols from parsing array as string
    // leaving only scopes delimited by commas
    String replacedScopesStr = scopesStr
      .replaceAll("[\\"\\\\[\\\\] ]", "")
      // this is for scopes that are in the form of a url
      .replace("\\\\", "");

    // scope to be in the form of an array
    String[] scopeArray = replacedScopesStr.split(",");

    requestedTokenScope = "oauth2:" + String.join(" ", scopeArray);
    loadSignInClient(clientId, forceCodeForRefreshToken, scopeArray);
    call.resolve();
  }
`;
      source = source.replace(
        /  @PluginMethod\(\)\n  public void initialize\(final PluginCall call\) \{[\s\S]*?\n  \}\n\n  \/\/ Logic to retrieve accessToken/,
        `${initializeMethod}\n  // Logic to retrieve accessToken`,
      );
    }
    if (source.includes(".requestIdToken(clientId)\n      .requestEmail()")) {
      throw new Error("Could not patch @codetrix-studio/capacitor-google-auth server client handling");
    }
    writeFileSync(javaPath, source);
    return true;
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
      "    GoogleSignInOptions.Builder googleSignInBuilder = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)\n      .requestIdToken(clientId)\n      .requestEmail();\n\n    if (forceCodeForRefreshToken) {\n      googleSignInBuilder.requestServerAuthCode(clientId, true);\n    }\n",
      "    GoogleSignInOptions.Builder googleSignInBuilder = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)\n      .requestEmail();\n\n    if (forceCodeForRefreshToken) {\n      googleSignInBuilder.requestIdToken(clientId);\n      googleSignInBuilder.requestServerAuthCode(clientId, true);\n    }\n",
    )
    .replace(
      '    AccountManagerFuture<Bundle> future = manager.getAuthToken(account, "oauth2:profile email", null, false, null, null);\n',
      "    AccountManagerFuture<Bundle> future = manager.getAuthToken(account, requestedTokenScope, null, false, null, null);\n",
    );

  if (patched === source) {
    throw new Error("Could not patch @codetrix-studio/capacitor-google-auth Android token scopes");
  }

  writeFileSync(javaPath, patched);
  return true;
}

function patchGradle() {
  let source;
  try {
    source = readFileSync(gradlePath, "utf8");
  } catch {
    return false;
  }

  const patched = source.replace(
    /^(\s*)repositories\s*\{\n([\s\S]*?)^(\s*)\}/gm,
    (block, blockIndent, body, closeIndent) => {
      const repoIndent = `${blockIndent}    `;
      const repos = body
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && line !== "jcenter()")
        .filter((line, index, lines) => lines.indexOf(line) === index);

      if (!repos.includes("google()")) repos.unshift("google()");
      if (!repos.includes("mavenCentral()")) repos.push("mavenCentral()");

      return `${blockIndent}repositories {\n${repos.map((repo) => `${repoIndent}${repo}`).join("\n")}\n${closeIndent}}`;
    },
  );
  if (patched === source) return false;

  writeFileSync(gradlePath, patched);
  return true;
}

patchJava();
patchGradle();
