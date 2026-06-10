import { NestFactory } from '@nestjs/core';
import { API_GLOBAL_PREFIX, resolveListenPort } from '@app/shared';
import { ProcessorModule } from './processor.module';

async function bootstrap() {
  const app = await NestFactory.create(ProcessorModule);
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  await app.listen(resolveListenPort());
}
bootstrap();
