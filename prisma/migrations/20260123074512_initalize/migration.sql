-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "usedInTestIds" JSONB;

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "preSelectedQuestionIds" JSONB;
