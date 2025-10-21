-- CreateEnum
CREATE TYPE "Category" AS ENUM ('Obat', 'Suplemen_dan_Vitamin', 'Grooming', 'Produk_Lainnya');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "category" "Category" NOT NULL DEFAULT 'Produk_Lainnya';
