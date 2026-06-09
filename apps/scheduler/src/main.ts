import { NestFactory } from '@nestjs/core';
import { API_GLOBAL_PREFIX } from '@app/shared';
import { SchedulerModule } from './scheduler.module';

async function bootstrap() {
  const app = await NestFactory.create(SchedulerModule);
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
