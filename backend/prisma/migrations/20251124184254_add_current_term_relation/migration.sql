-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_currentTermId_fkey" FOREIGN KEY ("currentTermId") REFERENCES "academic_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
