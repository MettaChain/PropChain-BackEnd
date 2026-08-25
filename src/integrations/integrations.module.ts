import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { MLS_ADAPTER, CRM_ADAPTER, PAYMENT_ADAPTER } from './contracts/adapters.interface';
import { StubMlsAdapter, StubCrmAdapter, StubPaymentAdapter } from './adapters/stub.adapter';

@Module({
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    {
      provide: MLS_ADAPTER,
      useClass: StubMlsAdapter,
    },
    {
      provide: CRM_ADAPTER,
      useClass: StubCrmAdapter,
    },
    {
      provide: PAYMENT_ADAPTER,
      useClass: StubPaymentAdapter,
    },
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
