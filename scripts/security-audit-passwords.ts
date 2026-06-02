// Security guard: ensures we do not regress on the password-reset attack surface.
//
// Run: bun run scripts/security-audit-passwords.ts
//
// Checks:
//   1. No edge function calls supabase.auth.admin.updateUserById without first
//      validating the caller via getUser() + an admin/platform-owner RPC.
//   2. No hardcoded passwords are committed to the repo.
//   3. SUPABASE_SERVICE_ROLE_KEY is never referenced from frontend (`src/`).
//   4. The deleted `reset-platform-passwords` function has no remaining references.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const failures: string[] = [];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ── 1. Edge functions calling updateUserById must be admin-gated ──────────
const fnDir = join(ROOT, "supabase/functions");
const tsFiles = walk(fnDir).filter((f) => f.endsWith(".ts"));
for (const f of tsFiles) {
  const src = readFileSync(f, "utf8");
  if (!/auth\.admin\.(updateUserById|createUser|deleteUser)/.test(src)) continue;

  const hasAuthHeader = /req\.headers\.get\(['"]Authorization['"]\)/i.test(src);
  const hasGetUser = /auth\.getUser\(|auth\.getClaims\(/.test(src);
  const hasAdminCheck =
    /is_admin|is_platform_owner|has_admin_role|is_platform_admin/.test(src);
  // setup-admin is the bootstrap exception: it self-locks once any admin exists.
  const isBootstrap = f.endsWith("/setup-admin/index.ts") &&
    /admin_users[\s\S]*count[\s\S]*> 0/.test(src);

  if (!isBootstrap && !(hasAuthHeader && hasGetUser && hasAdminCheck)) {
    failures.push(
      `[ungated-auth-admin] ${f.replace(ROOT, "")} calls auth.admin.* without ` +
        `Authorization header + getUser() + admin role check.`,
    );
  }
}

// ── 2. No hardcoded credential literals in repo ────────────────────────────
const allFiles = [
  ...walk(join(ROOT, "src")),
  ...walk(join(ROOT, "supabase/functions")),
].filter((f) => /\.(ts|tsx|js|jsx)$/.test(f) && !/\.test\.|\.spec\./.test(f));

const FORBIDDEN_LITERALS = [
  /Micros123@/,
  /DamPlatform!2026/,
  /DamManager!2026/,
];
for (const f of allFiles) {
  const src = readFileSync(f, "utf8");
  for (const re of FORBIDDEN_LITERALS) {
    if (re.test(src)) {
      failures.push(`[hardcoded-password] ${f.replace(ROOT, "")} matches ${re}`);
    }
  }
}

// ── 3. Service role key never referenced in frontend ───────────────────────
const frontFiles = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
for (const f of frontFiles) {
  const src = readFileSync(f, "utf8");
  if (/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(src)) {
    failures.push(`[service-role-leak] ${f.replace(ROOT, "")} references service role key.`);
  }
}

// ── 4. Deleted function must not be referenced anywhere ────────────────────
for (const f of allFiles) {
  if (f.includes("scripts/security-audit-passwords")) continue;
  const src = readFileSync(f, "utf8");
  if (/reset-platform-passwords/.test(src)) {
    failures.push(`[deleted-fn-reference] ${f.replace(ROOT, "")} still references reset-platform-passwords.`);
  }
}

if (failures.length > 0) {
  console.error("❌ Security audit failed:\n" + failures.map((l) => "  - " + l).join("\n"));
  process.exit(1);
}
console.log("✅ Password-reset security audit passed.");
