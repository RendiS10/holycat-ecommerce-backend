// ecommerce-backend/src/controllers/productController.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ... (kode getAllProducts & getProductById biarkan saja) ...

// 1. TAMBAH PRODUK (Create)
export const createProduct = async (req, res) => {
  const { title, description, price, stock, category, image } = req.body;

  try {
    const newProduct = await prisma.product.create({
      data: {
        title,
        description,
        price: parseFloat(price), // Pastikan angka
        stock: parseInt(stock) || 0,
        category: category || "Produk_Lainnya",
        image: image || "/images/placeholder.png",
      },
    });
    res.status(201).json(newProduct);
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ error: "Gagal membuat produk" });
  }
};

// 2. UPDATE PRODUK
export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const { title, description, price, stock, category, image } = req.body;

  try {
    const updatedProduct = await prisma.product.update({
      where: { id: parseInt(id) },
      data: {
        title,
        description,
        price: price ? parseFloat(price) : undefined,
        stock: stock ? parseInt(stock) : undefined,
        category,
        image,
      },
    });
    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ error: "Gagal mengupdate produk" });
  }
};

// 3. HAPUS PRODUK (Delete)
export const deleteProduct = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.product.delete({
      where: { id: parseInt(id) },
    });
    res.json({ message: "Produk berhasil dihapus" });
  } catch (error) {
    res.status(500).json({ error: "Gagal menghapus produk" });
  }
};
