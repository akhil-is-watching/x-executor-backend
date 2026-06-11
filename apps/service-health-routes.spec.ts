import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  ANALYTICS_HEALTH_PATH,
  API_GLOBAL_PREFIX,
  HUB_API_PREFIX,
  HUB_HEALTH_PATH,
  PROCESSOR_HEALTH_PATH,
  SCHEDULER_HEALTH_PATH,
  SENDER_HEALTH_PATH,
  WEBHOOK_HEALTH_PATH,
  apiRoutePath,
  hubApiRoutePath,
} from '@app/shared';
import { AnalyticsController } from './analytics/src/analytics.controller';
import { HubController } from './hub/src/hub.controller';
import { ProcessorController } from './processor/src/processor.controller';
import { SchedulerController } from './scheduler/src/scheduler.controller';
import { SenderController } from './sender/src/sender.controller';
import { WebhookHealthController } from './webhook/src/webhook-health.controller';

const healthControllers = [
  { name: 'hub', controller: HubController, path: HUB_HEALTH_PATH },
  { name: 'webhook', controller: WebhookHealthController, path: WEBHOOK_HEALTH_PATH },
  { name: 'processor', controller: ProcessorController, path: PROCESSOR_HEALTH_PATH },
  { name: 'sender', controller: SenderController, path: SENDER_HEALTH_PATH },
  { name: 'scheduler', controller: SchedulerController, path: SCHEDULER_HEALTH_PATH },
  { name: 'analytics', controller: AnalyticsController, path: ANALYTICS_HEALTH_PATH },
] as const;

describe('Service health routes', () => {
  for (const { name, controller, path } of healthControllers) {
    describe(name, () => {
      let app: INestApplication;

      beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
          controllers: [controller],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.setGlobalPrefix(name === 'hub' ? HUB_API_PREFIX : API_GLOBAL_PREFIX);
        await app.init();
      });

      afterEach(async () => {
        await app.close();
      });

      it(`GET ${name === 'hub' ? hubApiRoutePath(path) : apiRoutePath(path)}`, () => {
        return request(app.getHttpServer())
          .get(name === 'hub' ? hubApiRoutePath(path) : apiRoutePath(path))
          .expect(200)
          .expect({ status: 'ok' });
      });

      it('returns 404 for legacy root health', () => {
        return request(app.getHttpServer()).get('/').expect(404);
      });
    });
  }
});
