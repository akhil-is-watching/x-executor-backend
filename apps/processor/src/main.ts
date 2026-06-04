import { NestFactory } from '@nestjs/core';
import { ProcessorModule } from './processor.module';

async function bootstrap() {
  const app = await NestFactory.create(ProcessorModule);
  const port =
    process.env.PROCESSOR_PORT ?? process.env.PORT ?? process.env.port ?? 3002;
  await app.listen(port);
}
bootstrap();
