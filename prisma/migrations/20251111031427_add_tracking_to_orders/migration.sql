-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "courier" TEXT,
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "trackingNumber" TEXT;
