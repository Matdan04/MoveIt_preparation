-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingClient" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRowId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "rawPhone" TEXT NOT NULL,
    "rawEmail" TEXT NOT NULL,
    "rawJoined" TEXT NOT NULL,
    "rawStatus" TEXT NOT NULL,
    "normalizedPhone" TEXT,
    "normalizedName" TEXT NOT NULL,
    "email" TEXT,
    "joinedAt" TIMESTAMP(3),
    "parseErrors" TEXT[],

    CONSTRAINT "StagingClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingBooking" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRowId" TEXT NOT NULL,
    "rawMemberId" TEXT NOT NULL,
    "rawCoach" TEXT NOT NULL,
    "rawWhen" TEXT NOT NULL,
    "rawDuration" TEXT NOT NULL,
    "rawAttended" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "durationMin" INTEGER,
    "parseErrors" TEXT[],

    CONSTRAINT "StagingBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingPackage" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRowId" TEXT NOT NULL,
    "rawMemberId" TEXT NOT NULL,
    "rawPackage" TEXT NOT NULL,
    "rawSessions" TEXT NOT NULL,
    "rawBalance" TEXT NOT NULL,
    "sessionsPurchased" INTEGER,
    "balanceStated" INTEGER,
    "parseErrors" TEXT[],

    CONSTRAINT "StagingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_sourceSystem_idx" ON "ImportBatch"("sourceSystem");

-- CreateIndex
CREATE INDEX "StagingClient_batchId_idx" ON "StagingClient"("batchId");

-- CreateIndex
CREATE INDEX "StagingClient_normalizedPhone_idx" ON "StagingClient"("normalizedPhone");

-- CreateIndex
CREATE INDEX "StagingBooking_batchId_idx" ON "StagingBooking"("batchId");

-- CreateIndex
CREATE INDEX "StagingPackage_batchId_idx" ON "StagingPackage"("batchId");

-- AddForeignKey
ALTER TABLE "StagingClient" ADD CONSTRAINT "StagingClient_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagingBooking" ADD CONSTRAINT "StagingBooking_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagingPackage" ADD CONSTRAINT "StagingPackage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
