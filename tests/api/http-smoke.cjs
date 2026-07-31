/**
 * Supertest smoke against exported Express app (no listen).
 * - GET / health
 * - POST /api/manual/submit without Authorization must be 401 (gamification spoofing)
 * - POST /run missing body must be 400 (validation before expensive work)
 */
process.env.SUPPRESS_SERVER_LISTEN = "1";
process.env.NODE_ENV = process.env.NODE_ENV || "test";

if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = "https://placeholder.supabase.co";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.placeholder";
}

const assert = require("assert");
const request = require("supertest");

const app = require("../../server.cjs");

async function run() {
  const health = await request(app).get("/");
  assert.strictEqual(health.status, 200);

  const unauth = await request(app).post("/api/manual/submit").send({
    experiment_id: "00000000-0000-0000-0000-000000000000",
    student_name: "Test",
  });
  assert.strictEqual(
    unauth.status,
    401,
    "POST /api/manual/submit must reject missing Bearer token"
  );

  const badRun = await request(app).post("/run").send({});
  assert.strictEqual(badRun.status, 400, "POST /run must reject missing language/code");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
