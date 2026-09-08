-- AlterTable
ALTER TABLE "meeting_files" ADD COLUMN     "summary" JSONB,
ADD COLUMN     "summaryStatus" "MeetingFileStatus";
