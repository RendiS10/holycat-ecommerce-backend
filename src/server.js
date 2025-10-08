require("dotenv").config();
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
// const cors = require("cors"); // Tidak digunakan karena sudah ada custom middleware di bawah

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || "change-me";

// --- NEW: Cookie Options Helper untuk mengatasi SameSite ---
function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    // FIX: Gunakan SameSite=Lax di Development (HTTP) agar cookie tidak dihapus browser.
    // Di Production (HTTPS), gunakan SameSite=None dan Secure=true.
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax", // FIX APPLIED HERE
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}
// --- END: Cookie Options Helper ---

// Simple CORS for local development (Tetap mempertahankan struktur CORS custom Anda)
app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    process.env.FRONTEND_ORIGIN || "http://localhost:3000"
  );
  // allow cookies to be sent cross-origin when FRONTEND_ORIGIN is set
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// --- Helpers ---
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

async function authMiddleware(req, res, next) {
  // Try Authorization header first, then cookie
  const header = req.headers.authorization;
  let token;
  if (header && header.startsWith("Bearer ")) token = header.split(" ")[1];
  else if (req.cookies && req.cookies.token) token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    // Jika token tidak valid, hapus cookie (untuk berjaga-jaga)
    res.clearCookie("token", {
      httpOnly: true,
      sameSite: getCookieOptions().sameSite, // Gunakan SameSite yang sama saat menghapus
      secure: getCookieOptions().secure,
      path: "/",
    });
    return res.status(401).json({ error: "Invalid token" });
  }
}

// --- Auth Routes ---
app.post("/auth/register", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name)
    return res
      .status(400)
      .json({ error: "email, password and name are required" });
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return res.status(409).json({ error: "Email already registered" });
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hash, name },
    });
    return res
      .status(201)
      .json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "email and password are required" });
  try {
    if (process.env.DEBUG_API === "1") {
      console.log(`[DEBUG] /auth/login attempt for email=${email}`);
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      if (process.env.DEBUG_API === "1")
        console.log(`[DEBUG] user not found for email=${email}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (process.env.DEBUG_API === "1")
      console.log(`[DEBUG] user found id=${user.id} email=${user.email}`);
    const ok = await bcrypt.compare(password, user.password);
    if (process.env.DEBUG_API === "1")
      console.log(`[DEBUG] bcrypt.compare result for email=${email}: ${ok}`);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = generateToken(user.id);

    // PERUBAHAN: Menggunakan helper getCookieOptions
    const cookieOptions = getCookieOptions();

    // Set httpOnly cookie dengan SameSite yang benar
    res.cookie("token", token, cookieOptions);

    // For local development, also return token in response so the frontend
    // can fall back to using an Authorization header when cookies are blocked
    // by the browser (sameSite/secure restrictions). Do NOT enable this in
    // production.
    const payload = {
      user: { id: user.id, email: user.email, name: user.name },
    };
    if (process.env.NODE_ENV !== "production") {
      payload.token = token;
    }
    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// return current authenticated user (if cookie/token present)
app.get("/auth/me", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    return res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// logout: clear cookie
app.post("/auth/logout", (req, res) => {
  // PERUBAHAN: Menggunakan opsi cookie yang sama saat menghapus
  const cookieOptions = getCookieOptions();

  res.clearCookie("token", {
    httpOnly: true,
    sameSite: cookieOptions.sameSite, // Harus sama saat di-set
    secure: cookieOptions.secure,
    path: "/",
  });
  return res.json({ success: true });
});

// Dev-only: list users (email + id) when DEBUG_API=1
if (process.env.DEBUG_API === "1") {
  app.get("/debug/users", async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: { id: true, email: true, name: true },
      });
      res.json(users);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });
}

// --- Products ---
app.get("/products", async (req, res) => {
  try {
    const products = await prisma.product.findMany();
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ error: "Not found" });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// --- Cart ---
app.post("/cart/add", authMiddleware, async (req, res) => {
  const { productId, quantity } = req.body || {};
  const userId = req.userId;
  if (!productId)
    return res.status(400).json({ error: "productId is required" });
  try {
    const existing = await prisma.cartItem.findFirst({
      where: { userId, productId },
    });
    if (existing) {
      const updated = await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + (quantity || 1) },
      });
      return res.json(updated);
    }
    const created = await prisma.cartItem.create({
      data: { userId, productId, quantity: quantity || 1 },
    });
    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Get user cart (Protected route - GET /cart)
app.get("/cart", authMiddleware, async (req, res) => {
  const userId = req.userId;
  try {
    const items = await prisma.cartItem.findMany({
      where: { userId },
      include: {
        product: {
          select: {
            id: true,
            title: true, // PERBAIKAN: Mengganti 'name' menjadi 'title'
            price: true,
            image: true, // Menggunakan 'image' sesuai schema, bukan 'imageUrl'
          },
        },
      },
      orderBy: {
        product: {
          title: "asc", // PERBAIKAN: Mengganti 'name' menjadi 'title'
        },
      },
    });

    const subtotal = items.reduce(
      (s, it) => s + it.quantity * it.product.price,
      0
    );
    res.json({ items, subtotal });
  } catch (err) {
    console.error("Get cart error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/cart/update/:id", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const { quantity } = req.body || {};
  const userId = req.userId;
  if (!id || typeof quantity !== "number")
    return res.status(400).json({ error: "invalid payload" });
  try {
    const item = await prisma.cartItem.findUnique({ where: { id } });
    if (!item || item.userId !== userId)
      return res.status(403).json({ error: "Forbidden" });
    const updated = await prisma.cartItem.update({
      where: { id },
      data: { quantity },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/cart/remove/:id", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.userId;
  if (!id) return res.status(400).json({ error: "invalid id" });
  try {
    const item = await prisma.cartItem.findUnique({ where: { id } });
    if (!item || item.userId !== userId)
      return res.status(403).json({ error: "Forbidden" });
    await prisma.cartItem.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Health endpoint (no DB required) for smoke tests
app.get("/health", (req, res) => res.json({ ok: true }));

// Export app for tests; only listen when run directly
const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
