import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  ANALYTICS_HEALTH_PATH,
  API_GLOBAL_PREFIX,
  apiRoutePath,
} from '@app/shared';
import { NatsJsService } from '@app/nats-js';
import { AnalyticsController } from '../src/analytics.controller';

describe('AnalyticsController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
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

  it(`GET ${apiRoutePath(ANALYTICS_HEALTH_PATH)}`, () => {
    return request(app.getHttpServer())
      .get(apiRoutePath(ANALYTICS_HEALTH_PATH))
      .expect(200)
      .expect({ status: 'ok' });
  });
});
