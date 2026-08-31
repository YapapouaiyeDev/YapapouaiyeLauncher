import assert from "node:assert";
import { issueAdminToken, verifyAdminRequest, rateLimited } from "./functions/_lib/auth.js";

async function runTests() {
  console.log("▶ Test 1: issueAdminToken & verifyAdminRequest...");
  const env = {
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "securepassword123",
    ADMIN_TOKEN_SECRET: "my-test-secret-2026",
  };

  const token = await issueAdminToken(env, 1);
  assert(typeof token === "string" && token.includes("."), "Token should be a valid dot-separated string");

  const validReq = new Request("http://localhost/api/admin/session", {
    headers: { "Authorization": `Bearer ${token}` }
  });

  const verified = await verifyAdminRequest(validReq, env);
  assert(verified && verified.role === "admin", "Token should verify successfully with role admin");
  assert(verified.sub === "admin", "Token subject should match ADMIN_USERNAME");
  console.log("✔ Test 1 réussi !");

  console.log("▶ Test 2: Invalid/tampered token rejection...");
  const tamperedToken = token + "invalid";
  const tamperedReq = new Request("http://localhost/api/admin/session", {
    headers: { "Authorization": `Bearer ${tamperedToken}` }
  });
  const tamperedResult = await verifyAdminRequest(tamperedReq, env);
  assert(tamperedResult === false, "Tampered token must be rejected");

  const missingReq = new Request("http://localhost/api/admin/session");
  const missingResult = await verifyAdminRequest(missingReq, env);
  assert(missingResult === false, "Request without token must be rejected");
  console.log("✔ Test 2 réussi !");

  console.log("▶ Test 3: Rate limiter...");
  const dummyReq = new Request("http://localhost/api/admin/login", {
    headers: { "cf-connecting-ip": "192.168.1.100" }
  });

  for (let i = 0; i < 5; i++) {
    const limited = rateLimited(dummyReq, { limit: 5, windowMs: 10000, scope: "test" });
    assert(!limited, `Request ${i + 1} should be allowed`);
  }
  const blocked = rateLimited(dummyReq, { limit: 5, windowMs: 10000, scope: "test" });
  assert(blocked, "6th request should be rate limited");
  console.log("✔ Test 3 réussi !");

  console.log("\n🎉 Tous les tests unitaires des fonctions sont passés avec succès !");
}

runTests().catch(err => {
  console.error("❌ Échec des tests :", err);
  process.exit(1);
});
