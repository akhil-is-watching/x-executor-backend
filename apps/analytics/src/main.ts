import { NestFactory } from '@nestjs/core';
import { API_GLOBAL_PREFIX, resolveListenPort } from '@app/shared';
import { AnalyticsModule } from './analytics.module';

async function bootstrap() {
  const app = await NestFactory.create(AnalyticsModule);
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  await app.listen(resolveListenPort());
}
bootstrap();
