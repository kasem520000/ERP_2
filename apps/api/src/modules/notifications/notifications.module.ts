import { Inject, Module, OnModuleInit } from "@nestjs/common";

import { InfrastructureModule } from "../../infra/infra.module";
import { JobsService, getBoss } from "../../infra/jobs/boss";
import { env } from "../../config/env";
import {
  EmailService,
  EMAIL_QUEUE,
  identitySenders,
  type EmailJobPayload,
} from "./application/email-service";
import { InboxService } from "./application/inbox-service";
import { NotificationsController } from "./presentation/notifications.controller";

/** DI tokens (exported for consumer modules). */
export const EMAIL_SERVICE = Symbol("EMAIL_SERVICE");
export const IDENTITY_EMAIL_SENDERS = Symbol("IDENTITY_EMAIL_SENDERS");
export type { EmailService } from "./application/email-service";
export type { IdentityEmailSenders } from "./application/email-service";

/**
 * Notifications module (PHASE-003 email adapter + the PHASE-014 §2.8
 * in-app center, generalized at PHASE-015 T10 per FEATURE_CATALOG
 * `platform.notifications`): inbox rows + per-user preferences + owner
 * emails. Categories: the PHASE-014 billing-critical set plus `stock`
 * (the BR-019 reorder scan's in-app leg) and `templates` (industry
 * template upgrade offers). Registers the email job handler on both the
 * API and worker processes (WORKER_MODE selects what listens for HTTP;
 * jobs run in both).
 */
@Module({
  imports: [InfrastructureModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: EMAIL_SERVICE,
      useFactory: (jobs: JobsService) =>
        new EmailService({
          jobs,
          webBaseUrl: env.WEB_BASE_URL,
          fromAddress: env.SMTP_FROM,
        }),
      inject: [JobsService],
    },
    {
      provide: IDENTITY_EMAIL_SENDERS,
      useFactory: (email: EmailService) => identitySenders(email, env.WEB_BASE_URL),
      inject: [EMAIL_SERVICE],
    },
    InboxService,
  ],
  exports: [EMAIL_SERVICE, IDENTITY_EMAIL_SENDERS, InboxService],
})
export class NotificationsModule implements OnModuleInit {
  constructor(@Inject(EMAIL_SERVICE) private readonly email: EmailService) {}

  async onModuleInit(): Promise<void> {
    const boss = getBoss();
    await boss.work<EmailJobPayload>(EMAIL_QUEUE, async (jobs) => {
      // pg-boss v10 delivers batches; every job is handled idempotently.
      for (const job of jobs) {
        await this.email.handleJob(job.data);
      }
    });
  }
}
