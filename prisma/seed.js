import { PrismaClient, Role, Category } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 [1/4] Memulai proses seeding...");

  // 1. Bersihkan database lama
  console.log("🧹 [2/4] Membersihkan data lama...");
  try {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cartItem.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
  } catch (error) {
    console.warn("⚠️  Data lama sudah bersih atau tabel belum ada.");
  }

  // 2. Siapkan Data Produk (Rupiah)
  console.log("📦 [3/4] Menyiapkan data produk Rupiah...");

  // --- DATA ASLI (Menggunakan Enum Category) ---
  const products = [
    {
      title: "Royal Canin Kitten 2kg",
      description:
        "Makanan kering premium khusus untuk anak kucing usia 4-12 bulan.",
      price: 285000,
      image: "/images/product_01.png",
      stock: 50,
      category: Category.Makanan, // Pastikan ini Enum, bukan string
    },
    {
      title: "Whiskas Tuna 1.2kg",
      description: "Makanan kucing rasa tuna lezat dengan nutrisi lengkap.",
      price: 65000,
      image: "/images/product_02.png",
      stock: 100,
      category: Category.Makanan,
    },
    {
      title: "Me-O Creamy Treats (4x15g)",
      description: "Camilan kucing creamy rasa Salmon.",
      price: 22000,
      image: "/images/product_03.png",
      stock: 200,
      category: Category.Makanan,
    },
    {
      title: "Obat Kutu Detick 1ml",
      description: "Obat tetes kutu ampuh untuk kucing berat 1-10kg.",
      price: 35000,
      image: "/images/product_04.png",
      stock: 150,
      category: Category.Obat,
    },
    {
      title: "Vitamin Nutri-Plus Gel",
      description: "Suplemen energi tinggi untuk kucing masa pertumbuhan.",
      price: 145000,
      image: "/images/product_05.png",
      stock: 30,
      category: Category.Suplemen_dan_Vitamin,
    },
    {
      title: "Pasir Kucing Wangi 10L",
      description: "Pasir bentonite gumpal wangi lavender.",
      price: 55000,
      image: "/images/product_06.png",
      stock: 40,
      category: Category.Grooming,
    },
    {
      title: "Sampo Anti Jamur 250ml",
      description: "Sampo khusus mengatasi jamur dan masalah kulit.",
      price: 45000,
      image: "/images/product_07.png",
      stock: 60,
      category: Category.Grooming,
    },
    {
      title: "Mainan Tongkat Bulu",
      description: "Mainan interaktif untuk melatih insting berburu.",
      price: 15000,
      image: "/images/product_08.png",
      stock: 80,
      category: Category.Produk_Lainnya,
    },
  ];

  // --- TAMBAHAN: GENERATE 32 DATA DUMMY ---
  console.log("➕ Menambahkan 32 produk dummy tambahan...");

  const brands = [
    "Pro Plan",
    "Equilibrio",
    "Bolt",
    "Ori Cat",
    "Friskies",
    "Excel",
    "Maxi",
    "Kitchen Flavor",
  ];
  const types = [
    "Adult",
    "Kitten",
    "Hair & Skin",
    "Urinary",
    "Mother & Baby",
    "Persian",
  ];

  // FIX: Array berisi NILAI ENUM ASLI, bukan string
  const availableCategories = [
    Category.Makanan,
    Category.Obat,
    Category.Suplemen_dan_Vitamin,
    Category.Grooming,
    Category.Produk_Lainnya,
  ];

  for (let i = 1; i <= 32; i++) {
    const brand = brands[Math.floor(Math.random() * brands.length)];
    const type = types[Math.floor(Math.random() * types.length)];

    // Pilih kategori acak dari Enum yang valid
    const category =
      availableCategories[
        Math.floor(Math.random() * availableCategories.length)
      ];

    const price = (Math.floor(Math.random() * 76) + 4) * 5000;
    const stock = Math.floor(Math.random() * 90) + 10;
    const imgIndex = (i % 8) + 1;

    products.push({
      title: `${brand} ${type} Pack #${i}`,
      description: `Produk berkualitas dari ${brand} varian ${type}. Cocok untuk kebutuhan kucing kesayangan Anda. (Auto-generated #${i})`,
      price: price,
      image: `/images/product_0${imgIndex}.png`,
      stock: stock,
      category: category, // Ini sekarang Enum, bukan string
    });
  }

  // Masukkan SEMUA data produk
  await prisma.product.createMany({
    data: products,
    skipDuplicates: true,
  });

  // 3. Buat Admin & User
  console.log("👤 [4/4] Membuat User Admin...");
  const hashedPassword = await bcrypt.hash("secret", 10);

  const existingAdmin = await prisma.user.findUnique({
    where: { email: "test@example.com" },
  });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: "Admin Holycat",
        email: "test@example.com",
        password: hashedPassword,
        role: Role.ADMIN || "ADMIN", // Gunakan Enum atau String fallback
        city: "Jakarta Pusat",
        address: "Jalan Admin No. 1",
        phone: "08123456789",
      },
    });
    console.log("✅ Admin berhasil dibuat: test@example.com / secret");
  } else {
    console.log("ℹ️ Admin sudah ada.");
  }

  console.log(`🎉 SEEDING SELESAI! Total ${products.length} produk tersimpan.`);
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
