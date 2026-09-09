-- DropColumn: Remove summary and summaryStatus from meeting_files
ALTER TABLE "meeting_files" DROP COLUMN IF EXISTS "summary";
ALTER TABLE "meeting_files" DROP COLUMN IF EXISTS "summaryStatus";

-- AlterTable: Add summaryStatus to meetings and change summary to Text type
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "summaryStatus" "MeetingFileStatus";
ALTER TABLE "meetings" ALTER COLUMN "summary" TYPE TEXT;
