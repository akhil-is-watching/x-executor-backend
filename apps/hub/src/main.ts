import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HUB_API_PREFIX, resolveListenPort } from '@app/shared';
import { HubModule } from './hub.module';

function resolveCorsOrigin(): boolean | string | string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw || raw === '*') {
    return '*';
  }
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(HubModule);
  app.enableCors({
    origin: resolveCorsOrigin(),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    optionsSuccessStatus: 204,
  });
  app.setGlobalPrefix(HUB_API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('X Executor Hub API')
    .setDescription(
      'REST API for orgs, X connections, campaigns, DM chat history, and OAuth.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(resolveListenPort());
}
bootstrap();
