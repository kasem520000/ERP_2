import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PosModule } from "../pos/pos.module";
import { SalesModule } from "../sales/sales.module";
import { PushService } from "./application/push-service";
import { SyncController } from "./presentation/sync.controller";

/**
 * Sync module (PHASE-016 · the NARROW server slice; SYNC_PROTOCOL §11):
 * POS feed-group pull + pos_sale/cashier_shift push, on the SAME wire
 * contracts as the generalized PHASE-020 protocol. The push handlers
 * execute through the sales module's PosSaleService and the pos module's
 * shift flow — sync adds transport, never a second business-logic path.
 */
@Module({
  imports: [AuditModule, PosModule, SalesModule],
  controllers: [SyncController],
  providers: [PushService],
  exports: [PushService],
})
export class SyncModule {}
