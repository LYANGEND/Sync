-- Align default theme colors with the official Sync brand palette.
-- Only changes the column DEFAULT for future rows; existing rows keep
-- whatever primaryColor/secondaryColor/accentColor they already have.
ALTER TABLE "school_settings" ALTER COLUMN "primaryColor" SET DEFAULT '#0047AB';
ALTER TABLE "school_settings" ALTER COLUMN "accentColor" SET DEFAULT '#FF9933';
