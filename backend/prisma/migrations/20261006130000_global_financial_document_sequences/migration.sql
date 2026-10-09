-- Financial document numbers are globally unique in the canonical schema, so
-- their counters must also be global. Branch-scoped counters could independently
-- emit the same INV/REF/CN/EXP/JE number and then fail the document unique key.

CREATE TEMP TABLE "financial_sequence_maxima" (
  "prefix" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "lastNumber" INTEGER NOT NULL,
  PRIMARY KEY ("prefix", "year")
) ON COMMIT DROP;

INSERT INTO "financial_sequence_maxima" ("prefix", "year", "lastNumber")
SELECT "prefix", "year", MAX("lastNumber")
FROM "receipt_sequences"
GROUP BY "prefix", "year";

INSERT INTO "financial_sequence_maxima" ("prefix", "year", "lastNumber")
SELECT 'INV', split_part("invoiceNumber", '-', 2)::INTEGER, MAX(split_part("invoiceNumber", '-', 3)::INTEGER)
FROM "invoices"
WHERE "invoiceNumber" ~ '^INV-[0-9]{4}-[0-9]+$'
GROUP BY split_part("invoiceNumber", '-', 2)::INTEGER
ON CONFLICT ("prefix", "year") DO UPDATE
SET "lastNumber" = GREATEST("financial_sequence_maxima"."lastNumber", EXCLUDED."lastNumber");

INSERT INTO "financial_sequence_maxima" ("prefix", "year", "lastNumber")
SELECT 'REF', split_part("refundNumber", '-', 2)::INTEGER, MAX(split_part("refundNumber", '-', 3)::INTEGER)
FROM "refunds"
WHERE "refundNumber" ~ '^REF-[0-9]{4}-[0-9]+$'
GROUP BY split_part("refundNumber", '-', 2)::INTEGER
ON CONFLICT ("prefix", "year") DO UPDATE
SET "lastNumber" = GREATEST("financial_sequence_maxima"."lastNumber", EXCLUDED."lastNumber");

INSERT INTO "financial_sequence_maxima" ("prefix", "year", "lastNumber")
SELECT 'CN', split_part("creditNoteNumber", '-', 2)::INTEGER, MAX(split_part("creditNoteNumber", '-', 3)::INTEGER)
FROM "credit_notes"
WHERE "creditNoteNumber" ~ '^CN-[0-9]{4}-[0-9]+$'
GROUP BY split_part("creditNoteNumber", '-', 2)::INTEGER
ON CONFLICT ("prefix", "year") DO UPDATE
SET "lastNumber" = GREATEST("financial_sequence_maxima"."lastNumber", EXCLUDED."lastNumber");

INSERT INTO "financial_sequence_maxima" ("prefix", "year", "lastNumber")
SELECT 'EXP', split_part("expenseNumber", '-', 2)::INTEGER, MAX(split_part("expenseNumber", '-', 3)::INTEGER)
FROM "expenses"
WHERE "expenseNumber" ~ '^EXP-[0-9]{4}-[0-9]+$'
GROUP BY split_part("expenseNumber", '-', 2)::INTEGER
ON CONFLICT ("prefix", "year") DO UPDATE
SET "lastNumber" = GREATEST("financial_sequence_maxima"."lastNumber", EXCLUDED."lastNumber");

INSERT INTO "financial_sequence_maxima" ("prefix", "year", "lastNumber")
SELECT 'JE', split_part("entryNumber", '-', 2)::INTEGER, MAX(split_part("entryNumber", '-', 3)::INTEGER)
FROM "journal_entries"
WHERE "entryNumber" ~ '^JE-[0-9]{4}-[0-9]+$'
GROUP BY split_part("entryNumber", '-', 2)::INTEGER
ON CONFLICT ("prefix", "year") DO UPDATE
SET "lastNumber" = GREATEST("financial_sequence_maxima"."lastNumber", EXCLUDED."lastNumber");

DELETE FROM "receipt_sequences";

INSERT INTO "receipt_sequences" ("id", "prefix", "year", "lastNumber", "branchId")
SELECT
  md5(random()::TEXT || clock_timestamp()::TEXT || "prefix" || "year"::TEXT),
  "prefix",
  "year",
  "lastNumber",
  NULL
FROM "financial_sequence_maxima";

DROP INDEX "receipt_sequences_prefix_year_branchId_key";
CREATE UNIQUE INDEX "receipt_sequences_prefix_year_key"
  ON "receipt_sequences"("prefix", "year");
