-- CreateTable
CREATE TABLE "EventType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultMinSongs" INTEGER NOT NULL DEFAULT 3,
    "defaultMaxSongs" INTEGER NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventType_name_key" ON "EventType"("name");

-- Backfill EventType from existing Service.type values
INSERT INTO "EventType" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), s."type", NOW(), NOW()
FROM (SELECT DISTINCT "type" FROM "Service") s
WHERE s."type" IS NOT NULL;

-- Add new nullable columns to Service
ALTER TABLE "Service" ADD COLUMN "eventTypeId" TEXT;
ALTER TABLE "Service" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Service" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Service" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();
ALTER TABLE "Service" ADD COLUMN "minSongCount" INTEGER;
ALTER TABLE "Service" ADD COLUMN "maxSongCount" INTEGER;

-- Backfill eventTypeId from the matching EventType
UPDATE "Service" s
SET "eventTypeId" = et."id"
FROM "EventType" et
WHERE s."type" = et."name";

-- Backfill createdById to the first admin user, or create a system placeholder
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Service" WHERE "createdById" IS NULL) THEN
    IF EXISTS (SELECT 1 FROM "User" WHERE "role" = 'ADMINISTRATOR') THEN
      UPDATE "Service"
      SET "createdById" = (SELECT "id" FROM "User" WHERE "role" = 'ADMINISTRATOR' ORDER BY "createdAt" ASC LIMIT 1)
      WHERE "createdById" IS NULL;
    ELSE
      INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "createdAt")
      VALUES (gen_random_uuid(), 'System', 'system@rehearsify.local', '!', 'ADMINISTRATOR', NOW());
      UPDATE "Service"
      SET "createdById" = (SELECT "id" FROM "User" WHERE "email" = 'system@rehearsify.local')
      WHERE "createdById" IS NULL;
    END IF;
  END IF;
END $$;

-- Backfill song count columns from legacy columns
UPDATE "Service" SET "minSongCount" = "minSongs" WHERE "minSongCount" IS NULL;
UPDATE "Service" SET "maxSongCount" = "maxSongs" WHERE "maxSongCount" IS NULL;

-- Set updatedAt for any rows that still have the default
UPDATE "Service" SET "updatedAt" = "createdAt" WHERE "updatedAt" = NOW();

-- Add indexes
CREATE INDEX "Service_date_idx" ON "Service"("date");
CREATE INDEX "Service_status_idx" ON "Service"("status");
CREATE INDEX "Service_status_date_idx" ON "Service"("status", "date");

-- Add foreign keys (nullable columns first, constraints after backfill)
ALTER TABLE "Service" ADD CONSTRAINT "Service_eventTypeId_fkey"
  FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce NOT NULL after backfill
ALTER TABLE "Service" ALTER COLUMN "eventTypeId" SET NOT NULL;
ALTER TABLE "Service" ALTER COLUMN "createdById" SET NOT NULL;

-- Drop legacy columns
ALTER TABLE "Service" DROP COLUMN "type";
ALTER TABLE "Service" DROP COLUMN "minSongs";
ALTER TABLE "Service" DROP COLUMN "maxSongs";
