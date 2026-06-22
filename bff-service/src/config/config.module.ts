import { Module } from '@nestjs/common';

import { ServicesConfig } from './services.config';

@Module({
  providers: [ServicesConfig],
  exports: [ServicesConfig],
})
export class ConfigUtilsModule {}
