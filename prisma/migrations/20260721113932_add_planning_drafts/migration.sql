-- CreateTable
CREATE TABLE "PlanningDraft" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "songIds" TEXT[],
    "manualAdditions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PlanningDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanningDraft_serviceId_key" ON "PlanningDraft"("serviceId");

-- CreateIndex
CREATE INDEX "PlanningDraft_serviceId_idx" ON "PlanningDraft"("serviceId");

-- AddForeignKey
ALTER TABLE "PlanningDraft" ADD CONSTRAINT "PlanningDraft_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
