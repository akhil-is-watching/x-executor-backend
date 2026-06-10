import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  API_GLOBAL_PREFIX,
  PROCESSOR_HEALTH_PATH,
  apiRoutePath,
} from '@app/shared';
import { NatsJsService } from '@app/nats-js';
import { ProcessorController } from '../src/processor.controller';

describe('ProcessorController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProcessorController],
      providers: [
        {
          provide: NatsJsService,
          useValue: {
            onModuleInit: jest.fn(),
            onModuleDestroy: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(API_GLOBAL_PREFIX);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it(`GET ${apiRoutePath(PROCESSOR_HEALTH_PATH)}`, () => {
    return request(app.getHttpServer())
      .get(apiRoutePath(PROCESSOR_HEALTH_PATH))
      .expect(200)
      .expect({ status: 'ok' });
  });
});
