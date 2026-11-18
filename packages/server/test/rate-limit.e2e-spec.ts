import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

// Tighten the rate limit for this worker before AppModule is imported, so a
// short burst trips it. No tokens set, so auth stays off and the throttler
// (which runs first) is what rejects.
process.env.MLS_RATE_LIMIT = "3";
process.env.MLS_RATE_TTL = "60000";

let app: INestApplication;
let http: import("http").Server;

beforeAll(async () => {
  const { AppModule } = await import("../src/app.module");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  http = app.getHttpServer();
});

afterAll(async () => {
  await app.close();
  delete process.env.MLS_RATE_LIMIT;
  delete process.env.MLS_RATE_TTL;
});

describe("rate limiting", () => {
  it("returns 429 once the per-window request budget is exceeded", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await request(http).get("/key-packages/bob/available");
      statuses.push(res.status);
    }
    // The first few succeed; at least one later request is throttled.
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThan(0);
  });
});
