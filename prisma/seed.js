const { PrismaClient, Role } = require("@prisma/client"); // <-- Import Role
const prisma = new PrismaClient();

async function main() {
  const products = [
    {
      title: "Kucing Lucu",
      description: "Patung kucing lucu.",
      price: 9.99,
      image: "",
    },
    {
      title: "Mainan Kucing",
      description: "Mainan berbulu untuk kucing.",
      price: 4.5,
      image: "",
    },
    {
      title: "Makanan Kucing",
      description: "Makanan kucing berkualitas.",
      price: 19.99,
      image: "",
    },
    {
      title: "Tempat Tidur",
      description: "Tempat tidur empuk untuk kucing.",
      price: 29.99,
      image: "",
    },
    {
      title: "Kalung Kucing",
      description: "Kalung lucu untuk kucing.",
      price: 3.99,
      image: "",
    },
  ];

  // Seed products using createMany (skipDuplicates avoids errors if titles already exist)
  await prisma.product.createMany({
    data: products,
    skipDuplicates: true,
  });

  // Create a test user for login (email: test@example.com, password: secret)
  const bcrypt = require("bcrypt");
  const testEmail = "test@example.com";
  const testPassword = "secret";
  const existingUser = await prisma.user.findUnique({
    where: { email: testEmail },
  });
  if (!existingUser) {
    const hash = await bcrypt.hash(testPassword, 10);
    await prisma.user.create({
      data: {
        email: testEmail,
        password: hash,
        name: "Admin User",
        role: Role.ADMIN, // <-- Set role test user menjadi ADMIN
      },
    });
    console.log("Created test user: test@example.com (ADMIN) / secret");
  } else {
    // Pastikan user lama juga punya role
    if (existingUser.role !== Role.ADMIN) {
      await prisma.user.update({
        where: { email: testEmail },
        data: { role: Role.ADMIN },
      });
      console.log("Updated existing test user to ADMIN role.");
    } else {
      console.log("Test user already exists and has ADMIN role.");
    }
  }

  console.log("Seed finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
