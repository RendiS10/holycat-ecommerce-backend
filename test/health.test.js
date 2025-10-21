import request from "supertest";
import app from "../src/server.js";

describe("health", () => {
  it("GET /health should return 200", async () => {
    const res = await request(app).get("/health");
    if (res.status !== 200) throw new Error("unexpected status " + res.status);
  });
});
