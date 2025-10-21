import request from "supertest";
import assert from "assert";
import app from "../src/server.js";

describe("Cart API Flow", function () {
  this.timeout(15000);

  const agent = request.agent(app);
  const newUser = {
    email: `cart_test_${Date.now()}@example.com`,
    password: "password123",
    name: "Cart Test User",
  };
  let cartItemId;
  const productId = 1;

  before(async () => {
    await agent.post("/auth/register").send(newUser);
    await agent
      .post("/auth/login")
      .send({ email: newUser.email, password: newUser.password });
  });

  it("POST /cart/add - harus menambahkan produk ke keranjang untuk pengguna yang sudah login", async () => {
    const res = await agent
      .post("/cart/add")
      .send({ productId: productId, quantity: 2 })
      .expect(201);

    assert.ok(res.body.id, "Item keranjang yang baru dibuat harus memiliki ID");
    assert.strictEqual(res.body.productId, productId);
    assert.strictEqual(res.body.quantity, 2);
    cartItemId = res.body.id;
  });

  it("GET /cart - harus mengambil item keranjang milik pengguna", async () => {
    const res = await agent.get("/cart").expect(200);

    assert.ok(
      Array.isArray(res.body.items),
      "Respons harus memiliki properti 'items' berupa array"
    );
    assert.strictEqual(res.body.items.length, 1);
    assert.strictEqual(res.body.items[0].id, cartItemId);
  });

  it("PUT /cart/update/:id - harus memperbarui kuantitas item di keranjang", async () => {
    const res = await agent
      .put(`/cart/update/${cartItemId}`)
      .send({ quantity: 5 })
      .expect(200);

    assert.strictEqual(res.body.quantity, 5);
  });

  it("DELETE /cart/remove/:id - harus menghapus item dari keranjang", async () => {
    await agent.delete(`/cart/remove/${cartItemId}`).expect(200);

    const res = await agent.get("/cart").expect(200);
    assert.strictEqual(
      res.body.items.length,
      0,
      "Keranjang seharusnya kosong setelah item dihapus"
    );
  });
});
