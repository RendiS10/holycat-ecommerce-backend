import request from "supertest";
import assert from "assert";
import app from "../src/server.js";

describe("Auth API", function () {
  this.timeout(10000);

  const newUser = {
    email: `testuser_${Date.now()}@example.com`,
    password: "password123",
    name: "Auth Test User",
  };

  it("POST /auth/register - harus berhasil mendaftarkan pengguna baru", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send(newUser)
      .expect(201);

    assert.strictEqual(res.body.email, newUser.email);
    assert.strictEqual(res.body.name, newUser.name);
    assert.ok(res.body.id, "Respons harus menyertakan ID pengguna");
  });

  it("POST /auth/register - harus gagal jika email sudah terdaftar", async () => {
    await request(app).post("/auth/register").send(newUser).expect(409);
  });

  it("POST /auth/login - harus berhasil login dan mendapatkan token", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: newUser.email, password: newUser.password })
      .expect(200);

    assert.ok(res.body.token, "Respons harus menyertakan token JWT");
    assert.ok(res.body.user, "Respons harus menyertakan data pengguna");
    assert.strictEqual(res.body.user.email, newUser.email);
  });

  it("POST /auth/login - harus gagal dengan password yang salah", async () => {
    await request(app)
      .post("/auth/login")
      .send({ email: newUser.email, password: "wrongpassword" })
      .expect(401);
  });

  it("GET /auth/me - harus mengembalikan data pengguna yang sudah login", async () => {
    const agent = request.agent(app);

    await agent
      .post("/auth/login")
      .send({ email: newUser.email, password: newUser.password });

    const res = await agent.get("/auth/me").expect(200);

    assert.strictEqual(res.body.email, newUser.email);
  });
});
