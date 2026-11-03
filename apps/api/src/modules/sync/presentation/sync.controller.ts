import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { identityOf, type SessionContext } from "../../../infra/context/session-context";
import { UnauthenticatedError } from "../../identity/api/identity";
import { RequirePermissions } from "../../../infra/auth/require-permissions.decorator";
import { envelope } from "../../../infra/http/envelope";
import { POS_FEED_ENTITIES } from "../application/change-log-writer";
import { pull } from "../application/pull-service";
import { PushService } from "../application/push-service";
import { SYNC_CONTRACT_VERSION } from "../application/cursor-tokens";

/**
 * PHASE-016 · the narrow sync routes (T8; SYNC_PROTOCOL endpoint table):
 * device heartbeat/status, per-entity pull, batch push. Device identity
 * rides the authenticated session + the enrolled device id (the manual
 * pos-terminal enrollment binds them — full device tokens are PHASE-020);
 * a revoked device is rejected before ANY command executes.
 */

function requireIdentity(request: Request): SessionContext {
  const identity = identityOf(request);
  if (identity === undefined) {
    throw new UnauthenticatedError();
  }
  return identity;
}

const DEVICE_HEADER = "x-device-id";

@Controller()
export class SyncController {
  constructor(private readonly push: PushService) {}

  /** Heartbeat / status (§1 table): contract version, server time, the
   * POS feed group, pending flags. */
  @Get("api/v1/sync/status")
  @RequirePermissions("pos.sales.sell")
  async status(@Req() request: Request) {
    const identity = requireIdentity(request);
    const deviceId = request.headers[DEVICE_HEADER];
    let deviceOk = false;
    if (typeof deviceId === "string" && deviceId.length > 0) {
      try {
        await this.push.requireActivePosDevice(deviceId);
        deviceOk = true;
      } catch {
        deviceOk = false;
      }
    }
    return envelope({
      contractVersion: SYNC_CONTRACT_VERSION,
      serverTime: new Date().toISOString(),
      feedGroup: POS_FEED_ENTITIES,
      deviceOk,
      tenantId: identity.activeTenantId,
    });
  }

  /** Pull deltas (§2): per-entity-type cursor pagination. */
  @Get("api/v1/sync/pull")
  @RequirePermissions("pos.sales.sell")
  async pullDelta(
    @Req() request: Request,
    @Query("entity") entity?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    requireIdentity(request);
    if (typeof request.headers[DEVICE_HEADER] === "string") {
      await this.push.requireActivePosDevice(request.headers[DEVICE_HEADER] as string);
    }
    const result = await pull({
      entityType: z.string().min(2).max(40).parse(entity ?? ""),
      cursor: cursor === undefined || cursor === "" || cursor === "null" ? null : cursor,
      limit: limit === undefined ? undefined : Number(limit),
    });
    return envelope(result);
  }

  /** Push commands (§3): batch with per-item results; Idempotency-Key is
   * the batch id (the global POST guard enforces its presence). */
  @Post("api/v1/sync/push")
  @RequirePermissions("sales.pos_session.post")
  async pushCommands(@Req() request: Request, @Body() body: unknown) {
    requireIdentity(request);
    const deviceIdHeader = request.headers[DEVICE_HEADER];
    const input = z
      .object({
        batchId: z.string().min(8).max(120),
        commands: z.array(z.unknown()).max(200),
      })
      .parse(body);
    const result = await this.push.push({
      deviceId: z.string().uuid().parse(typeof deviceIdHeader === "string" ? deviceIdHeader : ""),
      batchId: input.batchId,
      commands: input.commands,
    });
    return envelope(result);
  }
}
