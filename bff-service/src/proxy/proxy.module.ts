import { Module } from '@nestjs/common';

import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';
import { ConfigUtilsModule } from '../config/config.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [ConfigUtilsModule, CacheModule],
  controllers: [ProxyController],
  providers: [ProxyService],
})
export class ProxyModule {}
