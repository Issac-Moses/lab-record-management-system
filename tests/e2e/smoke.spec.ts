import { test, expect } from "@playwright/test";

/**
 * API-level smoke (no browser launch). Survives CI/sandbox where Chromium may SEGV;
 * still proves `vite preview` serves the built SPA.
 */
test("built SPA root returns HTML", async ({ request }) => {
  const res = await request.get("/");
  expect(res.ok()).toBeTruthy();
  const ct = res.headers()["content-type"] || "";
  expect(ct).toMatch(/text\/html/i);
});
