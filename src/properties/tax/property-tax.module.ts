// @ts-nocheck

import { Module } from '@nestjs/common';
import { PropertyTaxService } from './property-tax.service';
import { PropertyTaxController } from './property-tax.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PropertyTaxController],
  providers: [PropertyTaxService],
  exports: [PropertyTaxService],
})
export class PropertyTaxModule {}
