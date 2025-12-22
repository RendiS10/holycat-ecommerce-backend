// ecommerce-backend/src/routes/productRoutes.js
import express from "express";
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productController.js";
import {
  authenticateToken,
  authorizeAdmin,
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Route Public (Siapapun bisa akses)
router.get("/", getAllProducts);
router.get("/:id", getProductById);

// Route ADMIN (Harus Login + Harus Admin)
// Perhatikan urutan middleware: Cek Token DULU -> Baru Cek Role Admin
router.post("/", authenticateToken, authorizeAdmin, createProduct);
router.put("/:id", authenticateToken, authorizeAdmin, updateProduct);
router.delete("/:id", authenticateToken, authorizeAdmin, deleteProduct);

export default router;
