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

// --- [BARU] Impor untuk File Upload ---
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
// ------------------------------------

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key";
const NODE_ENV = process.env.NODE_ENV || "development";

// --- [BARU] Setup __dirname untuk ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// -------------------------------------------

// ----------------------------------------------------------------------
// ---------------------------- MIDDLEWARES -----------------------------
// ----------------------------------------------------------------------

app.use(express.json());
app.use(cookieParser());

// --- [BARU] Sajikan folder uploads secara statis ---
// Ini membuat file di 'public/uploads' bisa diakses via http://localhost:4000/uploads/namafile.jpg
const uploadsDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));
// ------------------------------------------------

// Custom CORS middleware (Tidak berubah)
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

// --- [BARU] Konfigurasi Multer (Penyimpanan File) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir); // Simpan di folder 'public/uploads'
  },
  filename: (req, file, cb) => {
    // Buat nama file unik: order-[id]-[timestamp].jpg
    const orderId = req.params.id || "unknown";
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, `order-${orderId}-${uniqueSuffix}${extension}`);
  },
});

const upload = multer({
  storage: storage,
  // Filter hanya gambar
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(
      new Error(
        "Error: Hanya file gambar (jpeg, jpg, png, gif) yang diizinkan!"
      )
    );
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // Batas 5MB
});
// -------------------------------------------------

// Helper function to generate JWT
const generateToken = (userId, role) => {
  // Termasuk role di token
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "7d" });
};

// Middleware untuk memverifikasi JWT dari cookie atau Authorization header
const authMiddleware = (req, res, next) => {
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
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userRole = decoded.role; // Ambil role dari token
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
  "/auth/register",
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
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: Role.CUSTOMER, // Otomatis CUSTOMER
          city,
          address,
          phone,
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
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Email atau password salah" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Email atau password salah" });
    }
    const token = generateToken(user.id, user.role);
    res.cookie("token", token, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    const { password: _, ...userWithoutPass } = user;
    return res.json({ user: userWithoutPass, token }); // token for FE fallback
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 3. Get Authenticated User Info
app.get("/auth/me", authMiddleware, async (req, res) => {
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
  if (req.body.role || req.body.email || req.body.password) {
    return res.status(403).json({
      error: "Forbidden: Cannot change role, email, or password here",
    });
  }
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

// [FIX] Helper: Mendapatkan item keranjang user
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
  try {
    const items = await getCartItemsForUser(req.userId); // Sekarang fungsi ini terdefinisi

    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.product.price,
      0
    );

    return res.json({ items, subtotal: subtotal.toFixed(2) });
  } catch (err) {
    console.error("Get cart error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 9. Add/Update Item in Cart (Protected route)
app.post("/cart/add", authMiddleware, async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const userId = req.userId;
  const numericProductId = parseInt(productId);
  if (isNaN(numericProductId) || quantity <= 0) {
    return res.status(400).json({ error: "Invalid product ID or quantity" });
  }
  try {
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
  const id = parseInt(req.params.id);
  const { quantity } = req.body;
  const userId = req.userId;
  if (isNaN(id) || typeof quantity !== "number" || quantity < 1) {
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
    if (item.product.stock < quantity) {
      return res.status(400).json({
        error: `Stok ${item.product.title} tidak mencukupi (tersisa ${item.product.stock}).`,
      });
    }
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
  const id = parseInt(req.params.id);
  const userId = req.userId;
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID format" });
  try {
    const item = await prisma.cartItem.findFirst({
      where: { id: id, userId: userId },
    });
    if (!item) {
      return res
        .status(404)
        .json({ error: "Cart item not found or does not belong to user" });
    }
    await prisma.cartItem.delete({
      where: { id: id },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("Remove cart item error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Cart item not found." });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ----------------------------------------------------------------------
// ------------------------- ORDER ROUTES -------------------------------
// ----------------------------------------------------------------------

// 12. Create Order from Cart (MODIFIKASI alur status)
app.post("/orders/create", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { paymentMethod, cartItemIds } = req.body;

  if (!paymentMethod || !Object.values(PaymentMethod).includes(paymentMethod)) {
    return res.status(400).json({ error: "Metode pembayaran tidak valid" });
  }
  if (
    !Array.isArray(cartItemIds) ||
    cartItemIds.length === 0 ||
    cartItemIds.some((id) => typeof id !== "number" || isNaN(id))
  ) {
    return res.status(400).json({ error: "Daftar item keranjang tidak valid" });
  }

  try {
    const initialStatus =
      paymentMethod === PaymentMethod.COD
        ? OrderStatus.Diproses
        : OrderStatus.Menunggu_Pembayaran;

    const result = await prisma.$transaction(async (tx) => {
      const selectedCartItems = await tx.cartItem.findMany({
        where: {
          userId: userId,
          id: { in: cartItemIds },
        },
        include: {
          product: true,
        },
      });

      if (selectedCartItems.length !== cartItemIds.length) {
        throw new Error(
          "Satu atau lebih item yang dipilih tidak valid atau bukan milik Anda."
        );
      }

      let totalOrderPrice = 0;
      const orderItemsData = [];

      for (const item of selectedCartItems) {
        if (item.product.stock < item.quantity) {
          throw new Error(
            `Stok ${item.product.title} tidak mencukupi (${item.product.stock} tersisa)`
          );
        }
        totalOrderPrice += item.quantity * item.product.price;
        orderItemsData.push({
          productId: item.productId,
          quantity: item.quantity,
          price: item.product.price,
        });
      }

      const newOrder = await tx.order.create({
        data: {
          userId: userId,
          total: totalOrderPrice,
          status: initialStatus,
          paymentMethod: paymentMethod,
          items: {
            create: orderItemsData,
          },
        },
      });

      for (const item of selectedCartItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
      }

      await tx.cartItem.deleteMany({
        where: {
          id: { in: cartItemIds },
          userId: userId,
        },
      });

      return newOrder;
    });

    return res.status(201).json({ orderId: result.id });
  } catch (err) {
    console.error("Create order error:", err);
    if (err.message.includes("Stok") || err.message.includes("tidak valid")) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Gagal membuat pesanan" });
  }
});

// 13. Get Order Details (MODIFIKASI: Admin juga bisa lihat)
app.get("/orders/:id", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const orderId = parseInt(req.params.id);

  if (isNaN(orderId)) {
    return res.status(400).json({ error: "ID Order tidak valid" });
  }

  try {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
      },
      include: {
        items: {
          include: {
            product: {
              select: { title: true, image: true },
            },
          },
        },
        user: {
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

    if (!order) {
      return res.status(404).json({ error: "Order tidak ditemukan" });
    }

    if (order.userId !== userId && req.userRole !== Role.ADMIN) {
      return res.status(403).json({ error: "Akses ditolak" });
    }

    return res.json(order);
  } catch (err) {
    console.error(`Get order ${orderId} error:`, err);
    return res.status(500).json({ error: "Gagal mengambil detail order" });
  }
});

// 14. [MODIFIKASI] Customer: Submit Payment Proof (File Upload)
app.put(
  "/orders/:id/submit-proof",
  authMiddleware,
  upload.single("proofImage"),
  async (req, res) => {
    const userId = req.userId;
    const orderId = parseInt(req.params.id);

    if (!req.file) {
      return res
        .status(400)
        .json({ error: "File bukti pembayaran tidak ditemukan." });
    }

    const paymentProofUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;

    if (isNaN(orderId)) {
      return res.status(400).json({ error: "ID Order tidak valid" });
    }

    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, userId: userId },
      });

      if (!order) {
        return res
          .status(403)
          .json({ error: "Akses ditolak atau order tidak ditemukan" });
      }

      if (order.status !== OrderStatus.Menunggu_Pembayaran) {
        return res
          .status(400)
          .json({ error: "Tidak dapat mengunggah bukti untuk pesanan ini." });
      }

      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentProofUrl: paymentProofUrl,
        },
        include: {
          items: {
            include: { product: { select: { title: true, image: true } } },
          },
          user: {
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

      return res.json(updatedOrder);
    } catch (err) {
      console.error(`Submit proof for order ${orderId} error:`, err);
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr)
          console.error(
            "Gagal menghapus file upload setelah error:",
            unlinkErr
          );
      });
      return res.status(500).json({ error: "Gagal mengunggah bukti" });
    }
  }
);

// 15. [MODIFIKASI] Customer: Cancel Order
app.put("/orders/:id/cancel", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const orderId = parseInt(req.params.id);

  if (isNaN(orderId)) {
    return res.status(400).json({ error: "ID Order tidak valid" });
  }

  try {
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId: userId },
        include: { items: true },
      });

      if (!order) {
        throw new Error("Akses ditolak atau order tidak ditemukan");
      }

      const canCancel =
        (order.paymentMethod !== PaymentMethod.COD &&
          order.status === OrderStatus.Menunggu_Pembayaran) ||
        (order.paymentMethod === PaymentMethod.COD &&
          order.status === OrderStatus.Diproses);

      if (!canCancel) {
        throw new Error(
          `Pesanan dengan status ${order.status} tidak dapat dibatalkan.`
        );
      }

      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      const cancelledOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.Dibatalkan },
        include: {
          items: {
            include: { product: { select: { title: true, image: true } } },
          },
          user: {
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
      return cancelledOrder;
    });

    return res.json(updatedOrder);
  } catch (err) {
    console.error(`Gagal membatalkan order ${orderId}:`, err);
    if (
      err.message.includes("Akses ditolak") ||
      err.message.includes("tidak dapat dibatalkan")
    ) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Gagal membatalkan pesanan" });
  }
});

// 16. Get User's Order History
app.get("/orders", authMiddleware, async (req, res) => {
  const userId = req.userId;
  try {
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          take: 1,
          include: {
            product: { select: { title: true, image: true } },
          },
        },
      },
    });
    return res.json(orders);
  } catch (err) {
    console.error(`Get order history for user ${userId} error:`, err);
    return res.status(500).json({ error: "Gagal mengambil riwayat pesanan" });
  }
});

// 17. [MODIFIKASI] Customer: Hapus Order (Hanya jika Selesai / Dibatalkan)
app.delete("/orders/:id", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const orderId = parseInt(req.params.id);

  if (isNaN(orderId)) {
    return res.status(400).json({ error: "ID Order tidak valid" });
  }

  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: userId },
    });

    if (!order) {
      return res
        .status(403)
        .json({ error: "Akses ditolak atau order tidak ditemukan" });
    }

    if (
      order.status !== OrderStatus.Selesai &&
      order.status !== OrderStatus.Dibatalkan
    ) {
      return res.status(400).json({
        error: `Pesanan dengan status ${order.status} tidak dapat dihapus.`,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({
        where: { orderId: orderId },
      });
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

// 18. [ADMIN] Get All Orders
app.get("/admin/orders", adminAuthMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
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

// 19. [ADMIN] Update Order Status
app.put("/admin/orders/:id/status", adminAuthMiddleware, async (req, res) => {
  const orderId = parseInt(req.params.id);
  const { status } = req.body;

  if (isNaN(orderId)) {
    return res.status(400).json({ error: "ID Order tidak valid" });
  }

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
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Order tidak ditemukan" });
    }
    return res.status(500).json({ error: "Gagal memperbarui status pesanan" });
  }
});

// Health endpoint
app.get("/health", (req, res) => res.json({ ok: true }));

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

export default app;
