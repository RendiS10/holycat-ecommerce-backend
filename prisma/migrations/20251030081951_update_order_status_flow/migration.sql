/*
  Warnings:

  - The values [PENDING,PAID,SHIPPED,COMPLETED,CANCELLED] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('Menunggu_Pembayaran', 'Diproses', 'Dikemas', 'Dikirim', 'Selesai', 'Dibatalkan');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'Menunggu_Pembayaran';
COMMIT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentProofUrl" TEXT,
ALTER COLUMN "status" SET DEFAULT 'Menunggu_Pembayaran';
