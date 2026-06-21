import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ProxyModule } from './proxy/proxy.module';
import { CacheModule } from './cache/cache.module';
import { ConfigUtilsModule } from './config/config.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ConfigUtilsModule,
    CacheModule,
    ProxyModule,
  ],
})
export class AppModule {}
