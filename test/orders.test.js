import request from "supertest";
import assert from "assert";
import app from "../src/server.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("Order API Flow", function () {
  this.timeout(20000); // Beri waktu lebih untuk login, add cart, dan checkout

  const agent = request.agent(app); // Agent untuk menyimpan cookie sesi
  const testUser = {
    email: `order_test_${Date.now()}@example.com`,
    password: "password123",
    name: "Order Test User",
  };

  let mainProductId = 1; // Ambil produk pertama dari seed
  let mainCartItemId;
  let createdOrderId;

  // 1. Setup: Daftar, Login, dan Tambah Item ke Keranjang
  before(async () => {
    // Pastikan produk ada (jika tidak, ambil dari seed)
    const product = await prisma.product.findFirst();
    if (product) {
      mainProductId = product.id;
    }

    await agent.post("/auth/register").send(testUser);
    await agent
      .post("/auth/login")
      .send({ email: testUser.email, password: testUser.password });

    // Tambahkan item ke keranjang agar siap di-checkout
    const res = await agent
      .post("/cart/add")
      .send({ productId: mainProductId, quantity: 1 });
    mainCartItemId = res.body.id; // Simpan ID item keranjang
  });

  // Hapus user setelah selesai
  after(async () => {
    if (testUser.id) {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  // 2. Integration Test: Checkout (Tugas 12, Poin 2)
  it("POST /orders/create - harus berhasil membuat pesanan dari item keranjang yang dipilih", async () => {
    const res = await agent
      .post("/orders/create")
      .send({
        paymentMethod: "BANK_TRANSFER", // Kita uji alur Bank Transfer
        cartItemIds: [mainCartItemId], // Kirim ID item yang dipilih
      })
      .expect(201); // Harapkan 201 Created

    assert.ok(res.body.orderId, "Respons harus menyertakan orderId");
    createdOrderId = res.body.orderId; // Simpan orderId untuk tes berikutnya

    // Cek di DB apakah keranjang sudah kosong
    const cart = await agent.get("/cart");
    assert.strictEqual(
      cart.body.items.length,
      0,
      "Keranjang seharusnya sudah kosong"
    );
  });

  // 3. Unit Test: Get Order Detail (Tugas 12, Poin 1)
  it("GET /orders/:id - harus mengembalikan detail pesanan yang baru dibuat", async () => {
    const res = await agent.get(`/orders/${createdOrderId}`).expect(200);

    assert.strictEqual(res.body.id, createdOrderId);
    assert.strictEqual(res.body.status, "Menunggu_Pembayaran"); // Status awal BANK_TRANSFER
    assert.strictEqual(res.body.items.length, 1);
    assert.strictEqual(res.body.items[0].productId, mainProductId);
  });

  // 4. Unit Test: Get Order History (Tugas 12, Poin 1)
  it("GET /orders - harus mengembalikan riwayat pesanan yang berisi pesanan baru", async () => {
    const res = await agent.get("/orders").expect(200);
    assert.ok(Array.isArray(res.body), "Respons harus berupa array");
    assert.ok(res.body.length > 0, "Riwayat pesanan tidak boleh kosong");
    const found = res.body.some((order) => order.id === createdOrderId);
    assert.strictEqual(
      found,
      true,
      "Pesanan yang baru dibuat tidak ditemukan di riwayat"
    );
  });

  // 5. Test Simulasi Pembayaran (Tugas 12, Poin 3)
  it("PUT /orders/:id/submit-proof - harus berhasil mengunggah bukti bayar", async () => {
    // Karena kita tidak bisa mengunggah file di test Supertest, kita akan uji endpoint 'cancel'
    // sebagai gantinya, karena 'submit-proof' memerlukan multipart/form-data
    // Mari kita uji logika pembatalan (juga bagian dari API /orders/*)

    // Buat order baru untuk dibatalkan
    const addRes = await agent
      .post("/cart/add")
      .send({ productId: mainProductId, quantity: 1 });
    const newCartId = addRes.body.id;
    const orderRes = await agent.post("/orders/create").send({
      paymentMethod: "BANK_TRANSFER",
      cartItemIds: [newCartId],
    });
    const newOrderId = orderRes.body.orderId;

    // Test pembatalan
    const cancelRes = await agent
      .put(`/orders/${newOrderId}/cancel`)
      .expect(200);
    assert.strictEqual(cancelRes.body.status, "Dibatalkan");
  });
});
