import { NestFactory } from '@nestjs/core';
import { API_GLOBAL_PREFIX } from '@app/shared';
import { ProcessorModule } from './processor.module';

async function bootstrap() {
  const app = await NestFactory.create(ProcessorModule);
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  const port =
    process.env.PROCESSOR_PORT ?? process.env.PORT ?? process.env.port ?? 3002;
  await app.listen(port);
}
bootstrap();
