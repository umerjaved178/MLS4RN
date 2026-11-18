import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

// Enable auth for this worker before AppModule is imported.
const TOKEN = "test-secret-token";
process.env.MLS_API_TOKENS = `${TOKEN}, another-token`;

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
  delete process.env.MLS_API_TOKENS;
});

describe("bearer-token auth", () => {
  it("rejects a request with no Authorization header", async () => {
    await request(http).get("/key-packages/bob/available").expect(401);
  });

  it("rejects a wrong token", async () => {
    await request(http)
      .get("/key-packages/bob/available")
      .set("Authorization", "Bearer not-the-token")
      .expect(401);
  });

  it("accepts a valid token", async () => {
    await request(http)
      .get("/key-packages/bob/available")
      .set("Authorization", `Bearer ${TOKEN}`)
      .expect(200);
  });

  it("accepts any configured token", async () => {
    await request(http)
      .get("/key-packages/bob/available")
      .set("Authorization", "Bearer another-token")
      .expect(200);
  });
});
