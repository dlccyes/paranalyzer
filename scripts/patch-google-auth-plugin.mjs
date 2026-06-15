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
    return false;
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
