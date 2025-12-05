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

// --- Impor untuk Midtrans & File Upload ---
import midtransclient from "midtrans-client"; // Impor Midtrans
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
// --- [BARU] Impor Email Service ---
import { sendOrderStatusEmail } from "./emailService.js";
// ------------------------------------

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key";
const NODE_ENV = process.env.NODE_ENV || "development";

// --- Setup __dirname untuk ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// -------------------------------------------

// --- Inisialisasi Midtrans Snap ---
const snap = new midtransclient.Snap({
  isProduction: false, // Set 'true' di mode produksi
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});
// ---------------------------------------

// ----------------------------------------------------------------------
// ---------------------------- MIDDLEWARES -----------------------------
// ----------------------------------------------------------------------

app.use(express.json());
app.use(cookieParser());

// --- Sajikan folder uploads secara statis ---
const uploadsDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));
// ------------------------------------------------

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

// --- Konfigurasi Multer (Penyimpanan File) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const orderId = req.params.id || "unknown";
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, `order-${orderId}-${uniqueSuffix}${extension}`);
  },
});

const upload = multer({
  storage: storage,
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

// Helper function to generate JWT
const generateToken = (userId, role) => {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "7d" });
};

// Middleware untuk memverifikasi JWT
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
    req.userRole = decoded.role;
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
  authMiddleware(req, res, () => {
    if (req.userRole !== Role.ADMIN) {
      return res
        .status(403)
        .json({ error: "Akses ditolak: Memerlukan hak Admin" });
    }
    next();
  });
};

// ----------------------------------------------------------------------
// -------------------------- AUTH ROUTES -------------------------------
// ----------------------------------------------------------------------
app.post(
  "/auth/register",
  [
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
          role: Role.CUSTOMER,
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
    return res.json({ user: userWithoutPass, token });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
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
app.get("/products", async (req, res) => {
  // Ambil search query
  const { search } = req.query;
  try {
    const whereClause = search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });
    return res.json(products);
  } catch (err) {
    console.error("Get products error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

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

// 22. [ADMIN] Create Product
app.post("/products", adminAuthMiddleware, async (req, res) => {
  const { title, description, price, stock, image, category } = req.body;

  if (!title || !price || !category) {
    return res
      .status(400)
      .json({ error: "Judul, harga, dan kategori wajib diisi." });
  }
  if (!Object.values(Category).includes(category)) {
    return res.status(400).json({ error: "Kategori tidak valid." });
  }

  try {
    const product = await prisma.product.create({
      data: {
        title,
        description,
        price: parseFloat(price),
        stock: parseInt(stock) || 0,
        image: image || "/images/product_01.png",
        category: category,
      },
    });
    return res.status(201).json(product);
  } catch (err) {
    console.error("Create product error:", err);
    return res.status(500).json({ error: "Gagal membuat produk." });
  }
});

// 23. [ADMIN] Edit Product
app.put("/products/:id", adminAuthMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, description, price, stock, image, category } = req.body;

  if (isNaN(id))
    return res.status(400).json({ error: "ID Produk tidak valid" });

  try {
    const product = await prisma.product.update({
      where: { id },
      data: {
        title,
        description,
        price: price ? parseFloat(price) : undefined,
        stock: stock ? parseInt(stock) : undefined,
        image,
        category,
      },
    });
    return res.json(product);
  } catch (err) {
    console.error("Update product error:", err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Produk tidak ditemukan" });
    return res.status(500).json({ error: "Gagal mengupdate produk." });
  }
});

// 24. [ADMIN] Delete Product
app.delete("/products/:id", adminAuthMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id))
    return res.status(400).json({ error: "ID Produk tidak valid" });

  try {
    await prisma.product.delete({ where: { id } });
    return res.json({ message: "Produk berhasil dihapus" });
  } catch (err) {
    console.error("Delete product error:", err);
    if (err.code === "P2003") {
      return res.status(400).json({
        error:
          "Tidak bisa menghapus produk yang sudah pernah dipesan atau ada di keranjang user.",
      });
    }
    if (err.code === "P2025")
      return res.status(404).json({ error: "Produk tidak ditemukan" });
    return res.status(500).json({ error: "Gagal menghapus produk." });
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

app.get("/cart", authMiddleware, async (req, res) => {
  try {
    const items = await getCartItemsForUser(req.userId);
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
        error: `Stok ${product.title} tidak mencukupi (tersisa ${product.stock}).`,
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

// 12. Create Order from Cart
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

      // [PEMICU EMAIL] Ambil data user untuk email
      const orderUser = await tx.user.findUnique({ where: { id: userId } });
      return { newOrder, orderUser };
    });

    // [PEMICU EMAIL] Kirim email SETELAH transaksi sukses
    if (result.newOrder && result.orderUser) {
      sendOrderStatusEmail(result.newOrder, result.orderUser);
    }

    return res.status(201).json({ orderId: result.newOrder.id });
  } catch (err) {
    console.error("Create order error:", err);
    if (err.message.includes("Stok") || err.message.includes("tidak valid")) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: "Gagal membuat pesanan" });
  }
});

// 13. Get Order Details
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

// 14. Submit Payment Proof (Manual Upload)
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
        fs.unlink(req.file.path, () => {});
        return res
          .status(403)
          .json({ error: "Akses ditolak atau order tidak ditemukan" });
      }

      if (order.status !== OrderStatus.Menunggu_Pembayaran) {
        fs.unlink(req.file.path, () => {});
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

// 15. Customer: Cancel Order
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

    // [PEMICU EMAIL] Pesanan Dibatalkan
    sendOrderStatusEmail(updatedOrder, updatedOrder.user);

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

// 17. Customer: Hapus Order
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
// -------------------- PAYMENT ROUTES (MIDTRANS) -----------------------
// ----------------------------------------------------------------------

// 18. POST /payments/create - (SUDAH DIPERBAIKI)
app.post("/payments/create", authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "Order ID tidak valid" });
  }

  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: userId },
      include: {
        user: true,
        items: {
          include: { product: true },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order tidak ditemukan" });
    }

    if (order.status !== OrderStatus.Menunggu_Pembayaran) {
      return res.status(400).json({
        error: `Pesanan ini berstatus ${order.status} dan tidak dapat dibayar.`,
      });
    }

    // Siapkan item details dan bulatkan harga (Pencegahan Error 500)
    const item_details = order.items.map((item) => ({
      id: item.productId.toString(),
      price: Math.round(item.price),
      quantity: item.quantity,
      name: item.product.title.substring(0, 50),
    }));

    // Hitung ulang gross_amount dari item details
    const calculatedGrossAmount = item_details.reduce((sum, item) => {
      return sum + item.price * item.quantity;
    }, 0);

    let parameter = {
      transaction_details: {
        order_id: `HOLYCAT-${order.id}-${Date.now()}`,
        gross_amount: calculatedGrossAmount,
      },
      item_details: item_details,
      customer_details: {
        first_name: order.user.name,
        email: order.user.email,
        phone: order.user.phone || undefined,
        billing_address: {
          first_name: order.user.name,
          address: order.user.address || "N/A",
          city: order.user.city || "N/A",
          phone: order.user.phone || undefined,
        },
      },
      callbacks: {
        finish: `${
          process.env.FRONTEND_ORIGIN || "http://localhost:3000"
        }/order/${order.id}`,
      },
    };

    const transaction = await snap.createTransaction(parameter);

    return res.status(201).json({
      token: transaction.token,
      redirect_url: transaction.redirect_url,
    });
  } catch (err) {
    console.error("Midtrans create payment error:", err?.message || err);
    return res.status(500).json({
      error: "Gagal membuat sesi pembayaran. Cek terminal backend.",
    });
  }
});

// 19. POST /payments/notify (Webhook)
app.post("/payments/notify", async (req, res) => {
  const notificationJson = req.body;

  console.log(
    "Menerima notifikasi Midtrans:",
    JSON.stringify(notificationJson, null, 2)
  );

  try {
    const statusResponse = await snap.transaction.notification(
      notificationJson
    );
    let order_id = statusResponse.order_id;
    let transaction_status = statusResponse.transaction_status;
    let fraud_status = statusResponse.fraud_status;

    const orderIdParts = order_id.split("-");
    if (orderIdParts[0] !== "HOLYCAT" || !orderIdParts[1]) {
      console.error("Format Order ID tidak dikenal:", order_id);
      return res.status(400).send("Format Order ID tidak dikenal.");
    }
    const dbOrderId = parseInt(orderIdParts[1]);

    console.log(
      `Transaksi ${order_id} (DB ID: ${dbOrderId}): ${transaction_status}`
    );

    const order = await prisma.order.findUnique({ where: { id: dbOrderId } });
    if (!order) {
      console.error(`Order ${dbOrderId} tidak ditemukan di database.`);
      return res.status(404).send("Order tidak ditemukan.");
    }

    let newStatus = order.status;

    if (transaction_status == "capture" || transaction_status == "settlement") {
      if (fraud_status == "accept") {
        newStatus = OrderStatus.Diproses;
      }
    } else if (
      transaction_status == "cancel" ||
      transaction_status == "expire" ||
      transaction_status == "deny"
    ) {
      newStatus = OrderStatus.Dibatalkan;
      if (order.status !== OrderStatus.Dibatalkan) {
        const orderItems = await prisma.orderItem.findMany({
          where: { orderId: dbOrderId },
        });
        await prisma.$transaction(
          orderItems.map((item) =>
            prisma.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            })
          )
        );
        console.log(`Stok untuk Order ${dbOrderId} telah dikembalikan.`);
      }
    }

    if (newStatus !== order.status) {
      const updatedOrder = await prisma.order.update({
        where: { id: dbOrderId },
        data: { status: newStatus },
      });

      // [PEMICU EMAIL] Status Pembayaran Berubah
      const orderUser = await prisma.user.findUnique({
        where: { id: updatedOrder.userId },
      });
      if (orderUser) {
        sendOrderStatusEmail(updatedOrder, orderUser);
      }

      console.log(`Order ${dbOrderId} status diupdate ke ${newStatus}`);
    }

    return res.status(200).send("Notifikasi diterima.");
  } catch (err) {
    console.error("Gagal memproses notifikasi Midtrans:", err.message);
    return res.status(500).send("Internal Server Error");
  }
});

// ----------------------------------------------------------------------
// ------------------------- ADMIN ROUTES -------------------------------
// ----------------------------------------------------------------------

// 22. Get Admin Dashboard Stats
app.get("/admin/stats", adminAuthMiddleware, async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalOrders = await prisma.order.count();
    const paidOrders = await prisma.order.aggregate({
      _sum: {
        total: true,
      },
      where: {
        status: {
          in: [
            OrderStatus.Diproses,
            OrderStatus.Dikemas,
            OrderStatus.Dikirim,
            OrderStatus.Selesai,
          ],
        },
      },
    });
    const totalProducts = await prisma.product.count();
    const recentOrders = await prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    });

    return res.json({
      totalUsers,
      totalOrders,
      totalRevenue: paidOrders._sum.total || 0,
      totalProducts,
      recentOrders,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    return res.status(500).json({ error: "Gagal memuat statistik." });
  }
});

// 20. Get All Orders
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

// 21. Update Order Status
app.put("/admin/orders/:id/status", adminAuthMiddleware, async (req, res) => {
  const orderId = parseInt(req.params.id);
  const { status, trackingNumber, courier } = req.body;

  if (isNaN(orderId)) {
    return res.status(400).json({ error: "ID Order tidak valid" });
  }
  if (!status || !Object.values(OrderStatus).includes(status)) {
    return res.status(400).json({ error: "Status tidak valid" });
  }

  try {
    const updateData = {
      status: status,
    };

    if (status === OrderStatus.Dikirim) {
      if (!trackingNumber || !courier) {
        return res.status(400).json({
          error:
            "Nomor resi dan kurir wajib diisi saat mengubah status ke 'Dikirim'.",
        });
      }
      updateData.trackingNumber = trackingNumber;
      updateData.courier = courier;
      updateData.shippedAt = new Date();
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    // [PEMICU EMAIL] Status Update oleh Admin
    const orderUser = await prisma.user.findUnique({
      where: { id: updatedOrder.userId },
    });
    if (orderUser) {
      sendOrderStatusEmail(updatedOrder, orderUser);
    }

    return res.json(updatedOrder);
  } catch (err) {
    console.error(`Admin update order ${orderId} error:`, err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Order tidak ditemukan" });
    }
    return res.status(500).json({ error: "Gagal memperbarui status pesanan" });
  }
});

// 23. Get Report Data
app.get("/admin/reports/orders", adminAuthMiddleware, async (req, res) => {
  const { startDate, endDate, status } = req.query;

  try {
    let whereClause = {};

    if (startDate && endDate) {
      whereClause.createdAt = {
        gte: new Date(startDate),
        lte: new Date(new Date(endDate).setHours(23, 59, 59)),
      };
    }

    if (status && status !== "ALL") {
      whereClause.status = status;
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { name: true, email: true } },
        items: { include: { product: { select: { title: true } } } },
      },
    });

    const totalRevenue = orders.reduce((sum, order) => {
      if (
        order.status !== "Dibatalkan" &&
        order.status !== "Menunggu_Pembayaran"
      ) {
        return sum + order.total;
      }
      return sum;
    }, 0);

    const totalOrders = orders.length;

    return res.json({
      summary: { totalOrders, totalRevenue },
      orders,
    });
  } catch (err) {
    console.error("Report error:", err);
    return res.status(500).json({ error: "Gagal memuat laporan." });
  }
});

// Health endpoint
app.get("/health", (req, res) => res.json({ ok: true }));

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);

  // LOG DEBUGGING UNTUK MEMASTIKAN KUNCI TERBACA
  console.log("-------------------------------------------");
  console.log("🔍 Cek Konfigurasi Midtrans:");
  console.log("- Mode:", process.env.NODE_ENV);
  console.log("- Server Key Ada?", !!process.env.MIDTRANS_SERVER_KEY);
  console.log("- Client Key Ada?", !!process.env.MIDTRANS_CLIENT_KEY);
  if (process.env.MIDTRANS_SERVER_KEY) {
    console.log(
      "- Awalan Server Key:",
      process.env.MIDTRANS_SERVER_KEY.substring(0, 5) + "..."
    );
  }
  console.log("-------------------------------------------");
});

export default app;
