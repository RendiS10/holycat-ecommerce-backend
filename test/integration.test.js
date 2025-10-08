const request = require("supertest");
const assert = require("assert");
const { PrismaClient } = require("@prisma/client");
const app = require("../src/server");

const prisma = new PrismaClient();

describe("Auth + Cart integration", function () {
  this.timeout(10000);
  let email = `test+${Date.now()}@example.com`;
  let password = "secret";
  let token;
  let productId;
  let cartItemId;
  let userId;

  before(async () => {
    // ensure at least one product exists
    const products = await prisma.product.findMany({ take: 1 });
    if (!products || products.length === 0) {
      const p = await prisma.product.create({
        data: { title: "Integration Product", price: 1.23 },
      });
      productId = p.id;
    } else {
      productId = products[0].id;
    }
  });

  after(async () => {
    // cleanup: remove user and any cart items
    if (userId) {
      await prisma.cartItem.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("should register a new user", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email, password, name: "Integration Tester" });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.email, email);
    userId = res.body.id;
  });

  it("should login and receive a token", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email, password });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.token);
    token = res.body.token;
  });

  it("should add product to cart", async () => {
    const res = await request(app)
      .post("/cart/add")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, quantity: 2 });
    assert.ok([200, 201].includes(res.statusCode));
    assert.ok(res.body.id);
    cartItemId = res.body.id;
  });

  it("should retrieve cart with the item", async () => {
    const res = await request(app)
      .get("/cart")
      .set("Authorization", `Bearer ${token}`);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.items.length > 0);
  });

  it("should update cart item quantity", async () => {
    const res = await request(app)
      .put(`/cart/update/${cartItemId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 5 });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.quantity, 5);
  });

  it("should remove cart item", async () => {
    const res = await request(app)
      .delete(`/cart/remove/${cartItemId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
  });
});
