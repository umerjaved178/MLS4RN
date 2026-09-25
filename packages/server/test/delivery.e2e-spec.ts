import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { io } from "socket.io-client";
import { MlsClient } from "mls-ts";
import { AppModule } from "../src/app.module";

let app: INestApplication;
let http: import("http").Server;
let baseUrl: string;

const b64 = (u: Uint8Array): string => Buffer.from(u).toString("base64");
const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64"));

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0);
  http = app.getHttpServer();
  const addr = http.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await app.close();
});

describe("key package directory", () => {
  it("publishes and hands out single-use key packages", async () => {
    const bob = new MlsClient("bob");
    await request(http)
      .post("/key-packages")
      .send({ userId: "bob", keyPackages: [b64(bob.keyPackage()), b64(bob.keyPackage())] })
      .expect(201);

    const claim = await request(http).post("/key-packages/bob/claim").expect(201);
    expect(typeof claim.body.keyPackage).toBe("string");

    const avail = await request(http).get("/key-packages/bob/available").expect(200);
    expect(avail.body.available).toBe(1); // 2 published, 1 claimed
  });

  it("404s when no key package is available", async () => {
    await request(http).post("/key-packages/nobody/claim").expect(404);
  });
});

describe("group message log", () => {
  it("relays a real encrypted MLS conversation between two clients", async () => {
    const gid = "room-1";
    const alice = new MlsClient("alice");
    const bob = new MlsClient("bob");

    // Bob publishes a key package; Alice claims it to add him.
    await request(http).post("/key-packages").send({ userId: "bob-1", keyPackages: [b64(bob.keyPackage())] });
    const claim = await request(http).post("/key-packages/bob-1/claim");
    const bobKp = unb64(claim.body.keyPackage);

    // Alice founds the group, adds Bob, deposits his Welcome, posts the commit.
    const ag = alice.createGroup(gid);
    const add = ag.add(bobKp);
    await request(http)
      .post("/welcomes")
      .send({ userId: "bob-1", groupId: gid, welcome: b64(add.welcome), ratchetTree: b64(add.ratchetTree) });
    await request(http).post(`/groups/${gid}/messages`).send({ message: b64(add.commit), sender: "alice" }); // seq 1

    // Bob fetches his Welcome and joins.
    const inbox = await request(http).get("/welcomes/bob-1");
    const w = inbox.body.welcomes[0];
    const bg = bob.joinGroup(unb64(w.welcome), unb64(w.ratchetTree), gid);

    // Alice sends an application message through the server.
    await request(http).post(`/groups/${gid}/messages`).send({ message: b64(ag.send("hello over the wire")), sender: "alice" }); // seq 2

    // Bob pulls messages after the point he joined (the add commit was seq 1).
    const res = await request(http).get(`/groups/${gid}/messages?since=1`);
    let decrypted: string | null = null;
    for (const m of res.body.messages) {
      const text = bg.receiveText(unb64(m.message));
      if (text) decrypted = text;
    }
    expect(decrypted).toBe("hello over the wire");
  });

  it("returns messages in publish order with sequence numbers", async () => {
    const gid = "ordered";
    for (const t of ["a", "b", "c"]) {
      await request(http).post(`/groups/${gid}/messages`).send({ message: Buffer.from(t).toString("base64") });
    }
    const res = await request(http).get(`/groups/${gid}/messages`).expect(200);
    expect(res.body.messages.map((m: { seq: number }) => m.seq)).toEqual([1, 2, 3]);
    expect(res.body.messages.map((m: { message: string }) => Buffer.from(m.message, "base64").toString())).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(res.body.cursor).toBe(3);
  });
});

describe("welcome inbox", () => {
  it("deposits and consumes welcomes", async () => {
    await request(http)
      .post("/welcomes")
      .send({ userId: "carol", groupId: "g", welcome: "AA==", ratchetTree: "BB==" })
      .expect(201);
    const first = await request(http).get("/welcomes/carol").expect(200);
    expect(first.body.welcomes).toHaveLength(1);
    const second = await request(http).get("/welcomes/carol").expect(200);
    expect(second.body.welcomes).toHaveLength(0); // consumed
  });
});

describe("websocket delivery", () => {
  it("pushes new group messages to subscribers", async () => {
    const socket = io(baseUrl, { transports: ["websocket"], forceNew: true });
    await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
    await new Promise<void>((resolve) => socket.emit("subscribe", { groupId: "ws-room" }, () => resolve()));

    const received = new Promise<{ message: string }>((resolve) => socket.on("message", resolve));
    await request(http).post("/groups/ws-room/messages").send({ message: Buffer.from("live").toString("base64") });

    const msg = await received;
    expect(Buffer.from(msg.message, "base64").toString()).toBe("live");
    socket.disconnect();
  });
});
