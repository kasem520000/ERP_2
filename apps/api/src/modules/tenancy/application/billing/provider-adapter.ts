import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { env } from "../../../../config/env";
import { WEBHOOK_TOLERANCE_SECONDS } from "./billing-config";

/**
 * PHASE-014 payment-provider adapter port (PHASE-014 §2.2; OQ-003; RISK-022):
 * the provider choice is a decision record — the port is the contract. The
 * MVP ships the SANDBOX adapter (checkout session creation + settle-through-
 * the-webhook-pipeline) plus the mandatory manual-invoicing fallback (A-009)
 * which never touches this port. No production provider goes live at MVP —
 * sandbox + manual must both be operational (the phase's hard rule).
 *
 * Signature scheme (SECRETS §webhook; Stripe-style v1):
 *   header  = `t=<unix seconds>,v1=<hex hmac>`
 *   payload = `${t}.${rawBody}` HMAC-SHA256 with BILLING_WEBHOOK_SECRET.
 * Dev default secret is derived when unset (LOCAL-ONLY, documented in
 * .env.example — same envelope as IDENTITY_SECRET_KEY).
 */

export interface CreateCheckoutSessionInput {
  readonly tenantId: string;
  readonly planKey: string;
  readonly invoiceNumber: string;
  readonly amount: string;
  readonly currencyCode: string;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface CheckoutSession {
  /** Provider checkout reference (stored on the invoice + subscription). */
  readonly ref: string;
  /** Sandbox checkout URL on the web surface (tenant-authenticated page). */
  readonly url: string;
  readonly expiresAt: string;
}

export interface SettledWebhook {
  /** The exact bytes the provider would POST to the webhook route. */
  readonly rawBody: string;
  /** The signature header for those bytes (`t=…,v1=…`). */
  readonly signature: string;
}

export interface ProviderAdapterPort {
  readonly id: string;
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>;
  /** Sandbox-only: settle a session, producing the signed webhook delivery. */
  settleCheckout(input: {
    sessionRef: string;
    outcome: "succeeded" | "failed";
    tenantId: string;
    invoiceNumber: string;
    amount: string;
    currency: string;
  }): SettledWebhook;
}

export interface WebhookEventPayload {
  readonly id: string;
  readonly type: "payment.succeeded" | "payment.failed";
  readonly created_unix: number;
  readonly data: {
    readonly session_ref: string;
    readonly tenant_id: string;
    readonly invoice_number: string;
    readonly amount: string;
    readonly currency: string;
  };
}

/**
 * Webhook event ids: unique per DELIVERY (real-provider semantics — each
 * retry/dunning delivery is a new event; the ingest dedupes by the id
 * inside the payload, so re-posting the same bytes is the duplicate no-op
 * the replay tests assert).
 */
function eventId(): string {
  return `evt_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/** The dev-default LOCAL-ONLY secret (documented; production sets the env). */
export function webhookSecret(): string {
  if (env.BILLING_WEBHOOK_SECRET !== undefined && env.BILLING_WEBHOOK_SECRET !== "") {
    return env.BILLING_WEBHOOK_SECRET;
  }
  return "local-dev-billing-webhook-secret";
}

export function signWebhook(rawBody: string, atUnixSeconds: number, secret: string): string {
  const mac = createHmac("sha256", secret).update(`${atUnixSeconds}.${rawBody}`).digest("hex");
  return `t=${atUnixSeconds},v1=${mac}`;
}

/** Verify a webhook signature header against raw bytes (constant-time). */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  nowUnixSeconds: number,
): { ok: true } | { ok: false; reason: "malformed" | "stale" | "mismatch" } {
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(signatureHeader.trim());
  if (match === null) {
    return { ok: false, reason: "malformed" };
  }
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp) || Math.abs(nowUnixSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale" };
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const givenHex = match[2] ?? "";
  const given = Buffer.from(givenHex, "hex");
  const want = Buffer.from(expected, "hex");
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}

export function buildWebhookEvent(input: {
  sessionRef: string;
  tenantId: string;
  invoiceNumber: string;
  amount: string;
  currency: string;
  outcome: "succeeded" | "failed";
  atUnixSeconds: number;
}): { event: WebhookEventPayload; rawBody: string; signature: string } {
  const event: WebhookEventPayload = {
    id: eventId(),
    type: input.outcome === "succeeded" ? "payment.succeeded" : "payment.failed",
    created_unix: input.atUnixSeconds,
    data: {
      session_ref: input.sessionRef,
      tenant_id: input.tenantId,
      invoice_number: input.invoiceNumber,
      amount: input.amount,
      currency: input.currency,
    },
  };
  const rawBody = JSON.stringify(event);
  return {
    event,
    rawBody,
    signature: signWebhook(rawBody, input.atUnixSeconds, webhookSecret()),
  };
}

export interface SandboxAdapterDeps {
  readonly webBaseUrl: string;
  readonly secret?: string;
}

/**
 * The sandbox provider (PHASE-014 §2.2): real HTTP-shaped behavior with a
 * deterministic in-process settlement — `settleCheckout` produces the
 * signed webhook delivery that `POST /api/v1/platform/billing/webhook`
 * (and the tenant-plane complete route) processes through the IDENTICAL
 * verification + idempotency pipeline an external provider hits.
 */
export class SandboxProviderAdapter implements ProviderAdapterPort {
  readonly id = "sandbox";

  constructor(private readonly deps: SandboxAdapterDeps) {}

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    // The ref embeds the plan key segment (advisory only — the invoice row
    // is the authority; providers choose their own ref shapes).
    const ref = `cs_sbx_${input.planKey}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min ⚠
    return {
      ref,
      url: `${this.deps.webBaseUrl}/checkout?session=${encodeURIComponent(ref)}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  settleCheckout(input: {
    sessionRef: string;
    outcome: "succeeded" | "failed";
    tenantId: string;
    invoiceNumber: string;
    amount: string;
    currency: string;
  }): SettledWebhook {
    return buildWebhookEvent({
      sessionRef: input.sessionRef,
      tenantId: input.tenantId,
      invoiceNumber: input.invoiceNumber,
      amount: input.amount,
      currency: input.currency,
      outcome: input.outcome,
      atUnixSeconds: (Date.now() / 1000) | 0,
    });
  }
}
