import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
// WAJIB: Import PrismaClient dan Role dari @prisma/client
import { PrismaClient, Role } from "@prisma/client";
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

    // Generate JWT (Termasuk role user)
    const token = generateToken(user.id, user.role);

    // Set JWT in HttpOnly Cookie
    res.cookie("token", token, {
      httpOnly: true,
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

// 9. Add/Update Item in Cart (Protected route)
app.post("/cart/add", authMiddleware, async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const userId = req.userId;

  const numericProductId = parseInt(productId);

  if (isNaN(numericProductId) || quantity <= 0) {
    return res.status(400).json({ error: "Invalid product ID or quantity" });
  }

  try {
    const existing = await prisma.cartItem.findFirst({
      where: { userId, productId: numericProductId },
    });

    if (existing) {
      const updated = await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity },
      });
      return res.json(updated);
    }

    const created = await prisma.cartItem.create({
      data: { userId, productId: numericProductId, quantity },
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

  if (isNaN(id) || typeof quantity !== "number" || quantity < 0) {
    return res.status(400).json({ error: "Invalid ID or quantity payload" });
  }

  try {
    const item = await prisma.cartItem.findUnique({ where: { id } });
    if (!item || item.userId !== userId)
      return res.status(403).json({ error: "Forbidden: Not your cart item" });

    if (quantity === 0) {
      await prisma.cartItem.delete({ where: { id } });
      return res.json({ message: "Cart item removed" });
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
    const item = await prisma.cartItem.findUnique({ where: { id } });
    if (!item || item.userId !== userId)
      return res.status(403).json({ error: "Forbidden: Not your cart item" });

    await prisma.cartItem.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err) {
    console.error("Remove cart item error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Health endpoint (no DB required) for smoke tests
app.get("/health", (req, res) => res.json({ ok: true }));

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
