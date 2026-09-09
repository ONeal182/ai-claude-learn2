/*
  Warnings:

  - Added the required column `userId` to the `meetings` table without a default value. This is not possible if the table is not empty.

*/
-- Step 1: Add userId column as nullable first
ALTER TABLE "meetings" ADD COLUMN "userId" TEXT;

-- Step 2: Set userId to first available user for existing meetings
UPDATE "meetings"
SET "userId" = (SELECT "id" FROM "users" LIMIT 1)
WHERE "userId" IS NULL;

-- Step 3: Make userId NOT NULL
ALTER TABLE "meetings" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "meetings_userId_idx" ON "meetings"("userId");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
