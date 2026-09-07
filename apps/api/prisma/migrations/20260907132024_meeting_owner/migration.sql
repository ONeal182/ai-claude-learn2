/*
  Adds a required `ownerId` to `meetings` (data-ownership model — every meeting
  belongs to the user who created it). Existing meetings have no owner and cannot
  be back-filled unambiguously, so pre-existing rows are removed. Their file
  binaries on disk (UPLOADS_DIR) become orphans and should be cleared manually.
*/

-- Wipe ownerless legacy data (meeting_files first for clarity; FK also cascades).
DELETE FROM "meeting_files";
DELETE FROM "meetings";

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "ownerId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "meetings_ownerId_idx" ON "meetings"("ownerId");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
