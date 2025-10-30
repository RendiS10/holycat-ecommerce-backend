import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
// WAJIB: Import PrismaClient dan Enum dari @prisma/client
import {
  PrismaClient,
  Role,
  Category,
  OrderStatus,
  PaymentMethod,
} from "@prisma/client";
// WAJIB: Import body dan validationResult dari express-validator
import { body, validationResult } from "express-validator";

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key";
const NODE_ENV = process.env.NODE_ENV || "development";

// ----------------------------------------------------------------------
// ---------------------------- MIDDLEWARES -----------------------------
// ----------------------------------------------------------------------

app.use(express.json());
app.use(cookieParser());

// Custom CORS middleware
app.use((req, res, next) => {
  const allowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Helper function to generate JWT
const generateToken = (userId, role) => {
  // Termasuk role di token
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "7d" }); //
};

// Middleware untuk memverifikasi JWT dari cookie atau Authorization header
const authMiddleware = (req, res, next) => {
  //
  let token = req.cookies.token;

  if (!token && req.headers.authorization) {
    const [bearer, headerToken] = req.headers.authorization.split(" ");
    if (bearer === "Bearer" && headerToken) {
      token = headerToken;
    }
  }

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET); //
    req.userId = decoded.userId; //
    req.userRole = decoded.role; // Ambil role dari token //
    next();
  } catch (err) {
    res.clearCookie("token", {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "Lax",
    });
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

// ==> TAMBAHKAN MIDDLEWARE BARU DI SINI <==
// Middleware untuk proteksi rute ADMIN
const adminAuthMiddleware = (req, res, next) => {
  // Jalankan authMiddleware dulu untuk mendapatkan req.userId dan req.userRole
  authMiddleware(req, res, () => {
    // Setelah autentikasi, cek rolenya
    if (req.userRole !== Role.ADMIN) {
      return res
        .status(403)
        .json({ error: "Akses ditolak: Memerlukan hak Admin" });
    }
    // Jika admin, lanjutkan
    next();
  });
};

// ----------------------------------------------------------------------
// -------------------------- AUTH ROUTES -------------------------------
// ----------------------------------------------------------------------

// 1. User Registration
app.post(
  "/auth/register", //
  [
    // Validation menggunakan express-validator
    body("email").isEmail().withMessage("Email tidak valid."),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password minimal 6 karakter."),
    body("name").notEmpty().withMessage("Nama wajib diisi."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, city, address, phone } = req.body;

    try {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(409).json({ error: "Email sudah terdaftar." });
      }

      const hashedPassword = await bcrypt.hash(password, 10); //

      const newUser = await prisma.user.create({
        //
        data: {
          email,
          password: hashedPassword,
          name,
          role: Role.CUSTOMER, // Otomatis CUSTOMER
          city,
          address,
          phone, // Field alamat baru
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          city: true,
          address: true,
          phone: true,
          createdAt: true,
        },
      });

      return res.status(201).json(newUser);
    } catch (err) {
      console.error("Registration error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 2. User Login
app.post("/auth/login", async (req, res) => {
  //
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Email atau password salah" });
    }

    const isMatch = await bcrypt.compare(password, user.password); //
    if (!isMatch) {
      return res.status(401).json({ error: "Email atau password salah" });
    }

    // Generate JWT (Termasuk role user)
    const token = generateToken(user.id, user.role); //

    // Set JWT in HttpOnly Cookie
    res.cookie("token", token, {
      //
      httpOnly: true, //
      secure: NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Send user data (tanpa password)
    const { password: _, ...userWithoutPass } = user;
    return res.json({ user: userWithoutPass, token }); // token for FE fallback
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 3. Get Authenticated User Info
app.get("/auth/me", authMiddleware, async (req, res) => {
  //
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        city: true,
        address: true,
        phone: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(user);
  } catch (err) {
    console.error("Get user info error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 4. User Logout
app.post("/auth/logout", (req, res) => {
  res.clearCookie("token", {
    //
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "Lax",
  });
  return res.json({ message: "Logout successful" });
});

// ----------------------------------------------------------------------
// -------------------------- P R O F I L E -----------------------------
// ----------------------------------------------------------------------

// 5. Update User Profile (Protected route - PUT /user/profile)
app.put("/user/profile", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { name, city, address, phone } = req.body || {};

  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (city !== undefined) updateData.city = city;
  if (address !== undefined) updateData.address = address;
  if (phone !== undefined) updateData.phone = phone;

  // Pencegahan: Jangan biarkan klien mengubah role, email, atau password
  if (req.body.role || req.body.email || req.body.password) {
    return res.status(403).json({
      error: "Forbidden: Cannot change role, email, or password here",
    });
  }

  // Jika tidak ada data yang dikirim, keluar
  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "No update data provided" });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        city: true,
        address: true,
        phone: true,
        createdAt: true,
      },
    });

    return res.json(updatedUser);
  } catch (err) {
    console.error("Profile update error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------------------------------------------------------------
// ------------------------ PRODUCT ROUTES ------------------------------
// ----------------------------------------------------------------------

// 6. Get All Products (Simplified)
app.get("/products", async (req, res) => {
  //
  try {
    const products = await prisma.product.findMany();
    return res.json(products);
  } catch (err) {
    console.error("Get products error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 7. Get Product by ID
app.get("/products/:id", async (req, res) => {
  //
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID format" });

  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    return res.json(product);
  } catch (err) {
    console.error("Get product by ID error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------------------------------------------------------------
// ------------------------- CART ROUTES --------------------------------
// ----------------------------------------------------------------------

// Helper: Mendapatkan item keranjang user
const getCartItemsForUser = async (userId) => {
  return prisma.cartItem.findMany({
    where: { userId },
    include: {
      product: {
        select: { id: true, title: true, price: true, image: true },
      },
    },
    orderBy: { product: { title: "asc" } },
  });
};

// 8. Get Cart Content (Protected route)
app.get("/cart", authMiddleware, async (req, res) => {
  //
  try {
    const items = await getCartItemsForUser(req.userId);

    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.product.price,
      0
    );

    return res.json({ items, subtotal: subtotal.toFixed(2) }); //
  } catch (err) {
    console.error("Get cart error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 9. Add/Update Item in Cart (Protected route)
app.post("/cart/add", authMiddleware, async (req, res) => {
  //
  const { productId, quantity = 1 } = req.body;
  const userId = req.userId;

  const numericProductId = parseInt(productId);

  if (isNaN(numericProductId) || quantity <= 0) {
    return res.status(400).json({ error: "Invalid product ID or quantity" });
  }

  try {
    // Validasi stok sebelum menambahkan ke keranjang
    const product = await prisma.product.findUnique({
      where: { id: numericProductId },
      select: { stock: true, title: true },
    });
    if (!product) {
      return res.status(404).json({ error: "Produk tidak ditemukan." });
    }

    const existing = await prisma.cartItem.findFirst({
      where: { userId, productId: numericProductId },
    });

    const quantityToAdd = quantity;
    const currentQuantityInCart = existing ? existing.quantity : 0;
    const futureQuantity = currentQuantityInCart + quantityToAdd;

    if (product.stock < futureQuantity) {
      return res.status(400).json({
        error: `Stok ${product.title} tidak mencukupi (tersisa ${product.stock}, Anda mencoba menambahkan ${quantityToAdd} ke ${currentQuantityInCart} yang sudah ada).`,
      });
    }

    // Lanjutkan jika stok cukup
    if (existing) {
      const updated = await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: futureQuantity },
      });
      return res.json(updated);
    }

    const created = await prisma.cartItem.create({
      data: { userId, productId: numericProductId, quantity: quantityToAdd },
    });

    return res.status(201).json(created);
  } catch (err) {
    console.error("Add to cart error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 10. Update cart item quantity (Protected route)
app.put("/cart/update/:id", authMiddleware, async (req, res) => {
  //
  const id = parseInt(req.params.id);
  const { quantity } = req.body;
  const userId = req.userId;

  if (isNaN(id) || typeof quantity !== "number" || quantity < 1) {
    // Minimal 1
    return res
      .status(400)
      .json({ error: "Invalid ID or quantity payload (min 1)" });
  }

  try {
    const item = await prisma.cartItem.findUnique({
      where: { id },
      include: { product: { select: { stock: true, title: true } } },
    });
    if (!item || item.userId !== userId)
      return res.status(403).json({ error: "Forbidden: Not your cart item" });

    // Validasi stok saat update
    if (item.product.stock < quantity) {
      return res.status(400).json({
        error: `Stok ${item.product.title} tidak mencukupi (tersisa ${item.product.stock}).`,
      });
    }

    // Hapus jika quantity jadi 0 (logika ini dipindah, min Qty = 1)
    // if (quantity === 0) {
    //   await prisma.cartItem.delete({ where: { id } });
    //   return res.json({ message: "Cart item removed" });
    // }

    const updatedItem = await prisma.cartItem.update({
      where: { id },
      data: { quantity },
    });

    return res.json(updatedItem);
  } catch (err) {
    console.error("Update cart item error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 11. Remove cart item (Protected route)
app.delete("/cart/remove/:id", authMiddleware, async (req, res) => {
  //
  const id = parseInt(req.params.id);
  const userId = req.userId;

  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID format" });

  try {
    // Verifikasi kepemilikan sebelum menghapus
    const item = await prisma.cartItem.findFirst({
      where: { id: id, userId: userId },
    });
    if (!item) {
      // Bisa jadi 404 Not Found atau 403 Forbidden
      return res
        .status(404)
        .json({ error: "Cart item not found or does not belong to user" });
    }

    // Hapus item jika valid
    await prisma.cartItem.delete({
      where: { id: id }, // Cukup ID karena sudah diverifikasi
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Remove cart item error:", err);
    // Handle error spesifik jika item tidak ditemukan saat delete (meskipun sudah dicek)
    if (err.code === "P2025") {
      // Kode error Prisma untuk record not found on delete/update
      return res.status(404).json({ error: "Cart item not found." });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------------------------------------------------------------
// ------------------------- ORDER ROUTES -------------------------------
// ----------------------------------------------------------------------

// 12. Create Order from Cart (Protected) - DIMODIFIKASI untuk item terpilih
app.post("/orders/create", authMiddleware, async (req, res) => {
  const userId = req.userId;
  // ==> PERUBAHAN: Ambil cartItemIds dari body <==
  const { paymentMethod, cartItemIds } = req.body;

  // Validasi Payment Method
  if (!paymentMethod || !Object.values(PaymentMethod).includes(paymentMethod)) {
    return res.status(400).json({ error: "Metode pembayaran tidak valid" });
  }

  // ==> PERUBAHAN: Validasi cartItemIds <==
  if (
    !Array.isArray(cartItemIds) ||
    cartItemIds.length === 0 ||
    cartItemIds.some((id) => typeof id !== "number" || isNaN(id))
  ) {
    return res.status(400).json({ error: "Daftar item keranjang tidak valid" });
  }

  try {
    // --- TRANSAKSI DIMULAI ---
    const result = await prisma.$transaction(async (tx) => {
      // 1. Ambil HANYA item keranjang yang dipilih user beserta detail produk
      const selectedCartItems = await tx.cartItem.findMany({
        //
        where: {
          userId: userId,
          id: { in: cartItemIds }, // ==> PERUBAHAN: Filter berdasarkan ID yang dikirim //
        },
        include: {
          product: true, //
        },
      });

      // Validasi tambahan: Pastikan semua ID yang dikirim benar-benar ada di keranjang user
      if (selectedCartItems.length !== cartItemIds.length) {
        //
        throw new Error(
          "Satu atau lebih item yang dipilih tidak valid atau bukan milik Anda."
        ); //
      }
      if (selectedCartItems.length === 0) {
        // Seharusnya tidak terjadi jika validasi awal lolos, tapi jaga-jaga
        throw new Error("Tidak ada item valid yang dipilih.");
      }

      let totalOrderPrice = 0;
      const orderItemsData = [];

      // 2. Validasi Stok & Hitung Total (Hanya untuk item terpilih)
      for (const item of selectedCartItems) {
        if (item.product.stock < item.quantity) {
          //
          throw new Error(
            `Stok ${item.product.title} tidak mencukupi (${item.product.stock} tersisa)`
          ); // Lebih deskriptif //
        }
        totalOrderPrice += item.quantity * item.product.price; //
        orderItemsData.push({
          productId: item.productId,
          quantity: item.quantity,
          price: item.product.price, // Simpan harga saat ini //
        });
      }

      // 3. Buat Order
      const newOrder = await tx.order.create({
        //
        data: {
          userId: userId,
          total: totalOrderPrice,
          status: OrderStatus.PENDING, // Status awal //
          paymentMethod: paymentMethod, // Simpan metode pembayaran (Tugas 9) //
          items: {
            create: orderItemsData, // Buat OrderItems terkait //
          },
        },
      });

      // 4. Kurangi Stok Produk (Hanya untuk item terpilih)
      for (const item of selectedCartItems) {
        await tx.product.update({
          //
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity, //
            },
          },
        });
      }

      // 5. Hapus HANYA item yang dipilih dari Keranjang User
      await tx.cartItem.deleteMany({
        //
        where: {
          id: { in: cartItemIds }, // ==> PERUBAHAN: Hapus hanya yang di-checkout //
          userId: userId, // Pastikan hanya menghapus milik user ini
        },
      });

      return newOrder; // Kembalikan order yang baru dibuat
    });
    // --- TRANSAKSI SELESAI ---

    return res.status(201).json({ orderId: result.id }); //
  } catch (err) {
    console.error("Create order error:", err);
    // Kirim pesan error spesifik jika stok tidak cukup atau item tidak valid
    if (err.message.includes("Stok") || err.message.includes("tidak valid")) {
      //
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Gagal membuat pesanan" });
  }
});

// 13. Get Order Details (Protected)
app.get("/orders/:id", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const orderId = parseInt(req.params.id);

  if (isNaN(orderId)) {
    return res.status(400).json({ error: "ID Order tidak valid" });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        //
        items: {
          // Sertakan item dalam order //
          include: {
            product: {
              // Sertakan detail produk untuk setiap item //
              select: { title: true, image: true },
            },
          },
        },
        user: {
          // Sertakan info user (opsional, tapi berguna untuk alamat) //
          select: {
            name: true,
            email: true,
            address: true,
            city: true,
            phone: true,
          },
        },
      },
    });

    // Pastikan order ada dan milik user yang sedang login
    if (!order) {
      return res.status(404).json({ error: "Order tidak ditemukan" });
    }
    if (order.userId !== userId) {
      //
      return res.status(403).json({ error: "Akses ditolak" }); //
    }

    return res.json(order);
  } catch (err) {
    console.error(`Get order ${orderId} error:`, err);
    return res.status(500).json({ error: "Gagal mengambil detail order" });
  }
});

// 14. Simulate Paying an Order (Protected)
app.put("/orders/:id/pay", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const orderId = parseInt(req.params.id);

  if (isNaN(orderId)) {
    return res.status(400).json({ error: "ID Order tidak valid" });
  }

  try {
    // 1. Dapatkan order untuk memastikan milik user dan statusnya PENDING
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({ error: "Order tidak ditemukan" });
    }
    if (order.userId !== userId) {
      //
      return res.status(403).json({ error: "Akses ditolak" }); //
    }
    if (order.status !== OrderStatus.PENDING) {
      //
      return res
        .status(400)
        .json({ error: `Order sudah dalam status ${order.status}` }); //
    }

    // 2. Update status order menjadi PAID
    const updatedOrder = await prisma.order.update({
      //
      where: { id: orderId },
      data: {
        status: OrderStatus.PAID, //
        // Di aplikasi nyata, Anda mungkin menyimpan detail transaksi di sini
      },
    });

    // Kirim kembali order yang sudah diupdate
    return res.json(updatedOrder);
  } catch (err) {
    console.error(`Simulate payment for order ${orderId} error:`, err);
    return res.status(500).json({ error: "Gagal memproses pembayaran" });
  }
});

// 15. Get User's Order History (Protected) - Menggunakan GET /orders
app.get("/orders", authMiddleware, async (req, res) => {
  const userId = req.userId; //

  try {
    const orders = await prisma.order.findMany({
      //
      where: { userId }, //
      // Urutkan berdasarkan tanggal terbaru
      orderBy: { createdAt: "desc" }, //
      // Sertakan item untuk ringkasan (opsional, bisa juga hanya di detail)
      include: {
        //
        items: {
          take: 1, // Ambil 1 item saja untuk preview //
          include: {
            product: { select: { title: true, image: true } },
          },
        },
      },
    });

    return res.json(orders); // Kirim daftar pesanan //
  } catch (err) {
    console.error(`Get order history for user ${userId} error:`, err);
    return res.status(500).json({ error: "Gagal mengambil riwayat pesanan" });
  }
});
// 15. Get User's Order History (Protected) - Menggunakan GET /orders
app.get("/orders", authMiddleware, async (req, res) => {
  // ... (kode Anda yang sudah ada) ...
});

// ==> 16. [BARU] Hapus Order (Protected) <==
app.delete("/orders/:id", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const orderId = parseInt(req.params.id);

  if (isNaN(orderId)) {
    return res.status(400).json({ error: "ID Order tidak valid" });
  }

  try {
    // 1. Verifikasi bahwa order ini milik user yang sedang login
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId: userId,
      },
    });

    if (!order) {
      // Jika order tidak ada, atau bukan milik user ini, kirim error
      return res
        .status(403)
        .json({ error: "Akses ditolak atau order tidak ditemukan" });
    }

    // 2. Hapus order dalam transaksi
    // Kita harus menghapus OrderItem terkait terlebih dahulu, baru Order-nya.
    await prisma.$transaction(async (tx) => {
      // Hapus semua item yang terkait dengan order ini
      await tx.orderItem.deleteMany({
        where: { orderId: orderId },
      });

      // Hapus order utamanya
      await tx.order.delete({
        where: { id: orderId },
      });
    });

    return res.status(200).json({ message: "Order berhasil dihapus" });
  } catch (err) {
    console.error(`Gagal menghapus order ${orderId}:`, err);
    return res.status(500).json({ error: "Gagal menghapus pesanan" });
  }
});
// ----------------------------------------------------------------------
// ------------------------- ADMIN ROUTES -------------------------------
// ----------------------------------------------------------------------

// 16. [ADMIN] Get All Orders
app.get("/admin/orders", adminAuthMiddleware, async (req, res) => {
  //
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          // Sertakan info user yang memesan
          select: { name: true, email: true },
        },
      },
    });
    return res.json(orders);
  } catch (err) {
    console.error("Admin get all orders error:", err);
    return res.status(500).json({ error: "Gagal mengambil daftar pesanan" });
  }
});

// 17. [ADMIN] Update Order Status
app.put("/admin/orders/:id/status", adminAuthMiddleware, async (req, res) => {
  //
  const orderId = parseInt(req.params.id);
  const { status } = req.body; // Misal: "SHIPPED"

  if (isNaN(orderId)) {
    return res.status(400).json({ error: "ID Order tidak valid" });
  }

  // Validasi apakah status yang dikirim valid
  if (!status || !Object.values(OrderStatus).includes(status)) {
    return res.status(400).json({ error: "Status tidak valid" });
  }

  try {
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: status,
      },
    });
    return res.json(updatedOrder);
  } catch (err) {
    console.error(`Admin update order ${orderId} error:`, err);
    // Tangani jika order tidak ditemukan
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Order tidak ditemukan" });
    }
    return res.status(500).json({ error: "Gagal memperbarui status pesanan" });
  }
});

// Health endpoint (no DB required) for smoke tests
app.get("/health", (req, res) => res.json({ ok: true }));

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Ekspor app untuk pengujian
export default app;
