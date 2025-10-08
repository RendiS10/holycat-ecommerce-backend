const request = require("supertest");
const app = require("../src/server");

describe("health", () => {
  it("GET /health should return 200", async () => {
    const res = await request(app).get("/health");
    if (res.status !== 200) throw new Error("unexpected status " + res.status);
  });
});
