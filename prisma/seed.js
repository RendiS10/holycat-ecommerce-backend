// holycat-e-commerce/ecommerce-backend/prisma/seed.js

// PERBAIKAN SINTAKS: Mengganti require() dengan import
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const products = [
    // 5 Item Awal
    {
      title: "Kucing Lucu",
      description: "Patung kucing lucu.",
      price: 9.99,
      image: "/images/product_01.png",
      stock: 50, // Nilai Stok
    },
    {
      title: "Mainan Kucing",
      description: "Mainan berbulu untuk kucing.",
      price: 4.5,
      image: "/images/product_02.png",
      stock: 120, // Nilai Stok
    },
    {
      title: "Makanan Kucing",
      description: "Makanan kucing berkualitas.",
      price: 19.99,
      image: "/images/product_03.png",
      stock: 85, // Nilai Stok
    },
    {
      title: "Tempat Tidur",
      description: "Tempat tidur empuk untuk kucing.",
      price: 29.99,
      image: "/images/product_04.png",
      stock: 30, // Nilai Stok
    },
    {
      title: "Kalung Kucing",
      description: "Kalung lucu untuk kucing.",
      price: 3.99,
      image: "/images/product_05.png",
      stock: 200, // Nilai Stok
    },

    // 15 Item Baru Ditambahkan (Total 20)
    {
      title: "Bola Berbulu Set",
      description: "Satu set 5 bola berbulu warna-warni.",
      price: 6.5,
      image: "/images/product_06.png",
      stock: 150,
    },
    {
      title: "Sisir Anti-Kutu",
      description:
        "Sisir stainless steel efektif menghilangkan kutu dan telur.",
      price: 12.0,
      image: "/images/product_07.png",
      stock: 75,
    },
    {
      title: "Kotak Pasir Tertutup",
      description: "Kotak pasir besar dengan penutup untuk mengurangi bau.",
      price: 45.99,
      image: "/images/product_08.png",
      stock: 20,
    },
    {
      title: "Deodorizer Pasir Kucing",
      description: "Bubuk deodorizer dengan aroma lavender.",
      price: 7.5,
      image: "/images/product_09.png",
      stock: 180,
    },
    {
      title: "Snack Ikan Kering (Isi 10)",
      description: "Camilan ikan salmon kering alami.",
      price: 15.0,
      image: "/images/product_10.png",
      stock: 100,
    },
    {
      title: "Susu Khusus Kucing",
      description: "Susu rendah laktosa, ideal untuk anak kucing.",
      price: 11.5,
      image: "/images/product_11.png",
      stock: 60,
    },
    {
      title: "Tas Ransel Transparan",
      description: "Tas ransel pembawa kucing dengan jendela transparan.",
      price: 55.0,
      image: "/images/product_12.png",
      stock: 15,
    },
    {
      title: "Baju Hangat Kucing",
      description: "Baju rajut hangat untuk kucing tanpa bulu.",
      price: 18.0,
      image: "/images/product_13.png",
      stock: 40,
    },
    {
      title: "Sikat Gigi Kucing Set",
      description: "Sikat gigi jari dan sikat panjang.",
      price: 9.0,
      image: "/images/product_14.png",
      stock: 110,
    },
    {
      title: "Pasta Gigi Rasa Ayam",
      description: "Pasta gigi enzimatis rasa ayam.",
      price: 8.5,
      image: "/images/product_15.png",
      stock: 95,
    },
    {
      title: "Carrier Plastik Ringan",
      description: "Box carrier plastik ringan dengan ventilasi.",
      price: 35.0,
      image: "/images/product_16.png",
      stock: 25,
    },
    {
      title: "Mangkuk Makan Otomatis",
      description: "Dispenser makanan otomatis dengan timer.",
      price: 65.0,
      image: "/images/product_17.png",
      stock: 18,
    },
    {
      title: "Air Mancur Minum (Otomatis)",
      description: "Air mancur minum elektrik 2 liter.",
      price: 49.99,
      image: "/images/product_18.png",
      stock: 35,
    },
    {
      title: "Shampo Kucing Anti Jamur",
      description: "Shampo khusus untuk mengatasi jamur.",
      price: 22.5,
      image: "/images/product_19.png",
      stock: 70,
    },
    {
      title: "Tempat Cakar Tinggi",
      description: "Pohon cakar tinggi dengan beberapa tingkat.",
      price: 89.99,
      image: "/images/product_20.png",
      stock: 10,
    },
  ];

  // Seed products using createMany (skipDuplicates avoids errors if titles already exist)
  await prisma.product.createMany({
    data: products,
    skipDuplicates: true,
  });

  // --- LOGIKA TEST USER ADMIN ---
  const testEmail = "test@example.com";
  const testPassword = "secret";
  const existingUser = await prisma.user.findUnique({
    where: { email: testEmail },
  });

  const adminData = {
    role: Role.ADMIN,
    city: "Jakarta Pusat",
    address: "Jalan Merdeka No. 101, Komplek Admin",
    phone: "08123456789",
  };

  if (!existingUser) {
    const hash = await bcrypt.hash(testPassword, 10);
    await prisma.user.create({
      data: {
        email: testEmail,
        password: hash,
        name: "Admin User",
        ...adminData,
      },
    });
    console.log("Created test user: test@example.com (ADMIN) / secret");
  } else {
    if (existingUser.role !== Role.ADMIN || !existingUser.city) {
      await prisma.user.update({
        where: { email: testEmail },
        data: adminData,
      });
      console.log(
        "Updated existing test user to ADMIN role and added address details."
      );
    } else {
      console.log("Test user already exists and has complete ADMIN details.");
    }
  }

  console.log("Seed finished.");
}

main()
  .catch(async (e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
