import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  API_GLOBAL_PREFIX,
  SCHEDULER_HEALTH_PATH,
  apiRoutePath,
} from '@app/shared';
import { NatsJsService } from '@app/nats-js';
import { SchedulerController } from '../src/scheduler.controller';

describe('SchedulerController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SchedulerController],
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

  it(`GET ${apiRoutePath(SCHEDULER_HEALTH_PATH)}`, () => {
    return request(app.getHttpServer())
      .get(apiRoutePath(SCHEDULER_HEALTH_PATH))
      .expect(200)
      .expect({ status: 'ok' });
  });
});
