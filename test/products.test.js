import request from "supertest";
import assert from "assert";
import app from "../src/server.js";

describe("Products API", function () {
  this.timeout(5000);

  it("GET /products - harus mengembalikan daftar produk", async () => {
    const res = await request(app).get("/products").expect(200);

    assert.ok(Array.isArray(res.body), "Respons harus berupa array");
    assert.ok(res.body.length > 0, "Daftar produk tidak boleh kosong");
    assert.ok(res.body[0].id, "Produk harus memiliki ID");
    assert.ok(res.body[0].title, "Produk harus memiliki judul");
  });

  it("GET /products/:id - harus mengembalikan satu produk jika ID valid", async () => {
    const productId = 1;
    const res = await request(app).get(`/products/${productId}`).expect(200);

    assert.strictEqual(res.body.id, productId);
  });

  it("GET /products/:id - harus mengembalikan 404 jika produk tidak ditemukan", async () => {
    const nonExistentId = 99999;
    await request(app).get(`/products/${nonExistentId}`).expect(404);
  });
});
