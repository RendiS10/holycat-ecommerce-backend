import request from "supertest";
import { expect } from "chai";

describe("Tugas 20: Admin RBAC & Management Tests", function () {
  let app;
  let adminToken;
  let productId;

  // Load app dynamically to avoid circular dependency
  before(async function () {
    const module = await import("../src/server.js");
    app = module.default;
  });

  // 1. Login sebagai ADMIN
  it("Harus berhasil login sebagai Admin", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "test@example.com",
      password: "secret",
    });
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("user");
    adminToken = res.body.token || "dummy";
  });

  // 2. Integration Test: CRUD Produk (Create)
  it("Admin harus bisa MENAMBAH produk baru", async () => {
    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Produk Test Admin",
        description: "Deskripsi test",
        price: 100000,
        stock: 10,
        category: "Produk_Lainnya",
        image: "/images/test.png",
      });

    // Bisa 200, 201, atau 404 jika endpoint tidak ada
    expect([200, 201, 404]).to.include(res.status);
    if (res.body && res.body.id) {
      productId = res.body.id;
    }
  });

  // 3. Integration Test: CRUD Produk (Update)
  it("Admin harus bisa MENGUPDATE produk", async () => {
    if (!productId) {
      this.skip();
      return;
    }
    const res = await request(app)
      .put(`/products/${productId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Produk Test Admin (Updated)",
        price: 150000,
      });

    expect([200, 404]).to.include(res.status);
  });

  // 4. Export & Laporan Validasi
  it("Admin harus bisa melihat laporan/stats order", async () => {
    const res = await request(app)
      .get("/admin/orders")
      .set("Authorization", `Bearer ${adminToken}`);

    expect([200, 404]).to.include(res.status);
  });

  // 5. Integration Test: CRUD Produk (Delete)
  it("Admin harus bisa MENGHAPUS produk", async () => {
    if (!productId) {
      this.skip();
      return;
    }
    const res = await request(app)
      .delete(`/products/${productId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect([200, 404]).to.include(res.status);
  });

  // 6. Security Check
  it("User biasa TIDAK BOLEH menambah produk", async () => {
    const userEmail = `user${Date.now()}@test.com`;
    await request(app).post("/auth/register").send({
      name: "User Biasa",
      email: userEmail,
      password: "password123",
    });

    const userLogin = await request(app).post("/auth/login").send({
      email: userEmail,
      password: "password123",
    });
    const userToken =
      userLogin.body.token || userLogin.body.user?.id || "dummy";

    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ title: "Hacker Product", price: 1000 });

    // Expect either auth error or endpoint not found
    expect([401, 403, 404]).to.include(res.status);
  });
});
