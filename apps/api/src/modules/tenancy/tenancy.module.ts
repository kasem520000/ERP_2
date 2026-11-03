import { Module, OnModuleInit } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ConfigurationModule } from "../configuration/configuration.module";
import { IdentityModule } from "../identity/identity.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RegistrationService } from "./application/registration-service";
import { OnboardingService } from "./application/onboarding-service";
import { BranchService } from "./application/branch-service";
import { SettingsService } from "./application/settings-service";
import { EntitlementsService } from "./application/entitlements-service";
import { LifecycleService } from "./application/lifecycle-service";
import { SupportAccessService } from "./application/support-access-service";
import { PlatformConsoleService } from "./application/platform-console-service";
import { RegistrationController } from "./presentation/public/registration.controller";
import { PublicPlansController } from "./presentation/public/plans.controller";
import { TenancyController } from "./presentation/tenancy.controller";
import { PlatformConsoleController } from "./presentation/platform/platform.controller";
import { PlatformBillingController } from "./presentation/platform/billing.controller";
import { BillingWebhookController } from "./presentation/platform/webhook.controller";
import { SubscriptionService } from "./application/billing/subscription-service";
import {
  UsageService,
  registerDocumentCounterSubscriber,
} from "./application/billing/usage-service";

/**
 * Tenancy module (PHASE-004; MODULE_BOUNDARIES.md): owns tenants,
 * branches, settings, plans, subscriptions, entitlements, support
 * sessions; publishes tenant context, resolveEntitlements and the branch
 * registry. Dependencies per DEPENDENCY_RULES §2: identity (memberships,
 * sessions, role templates) + audit + configuration (feature catalog,
 * settings schema, §9 events) + notifications (registration email).
 */
@Module({
  imports: [AuditModule, ConfigurationModule, IdentityModule, NotificationsModule],
  controllers: [
    RegistrationController,
    PublicPlansController,
    TenancyController,
    PlatformConsoleController,
    PlatformBillingController,
    BillingWebhookController,
  ],
  providers: [
    RegistrationService,
    OnboardingService,
    BranchService,
    SettingsService,
    EntitlementsService,
    LifecycleService,
    SupportAccessService,
    PlatformConsoleService,
    SubscriptionService,
    UsageService,
  ],
  exports: [
    RegistrationService,
    EntitlementsService,
    LifecycleService,
    SupportAccessService,
    SubscriptionService,
    UsageService,
  ],
})
export class TenancyModule implements OnModuleInit {
  constructor(private readonly usage: UsageService) {}

  /**
   * The fail-safe documents counter subscriber (PHASE-014 §6): listens for
   * journal.posted ledger events and bumps the usage read model inside its
   * own UoW — INV-022 by construction (a broken counter never breaks the
   * posting transaction).
   */
  onModuleInit(): void {
    registerDocumentCounterSubscriber(this.usage);
  }
}

