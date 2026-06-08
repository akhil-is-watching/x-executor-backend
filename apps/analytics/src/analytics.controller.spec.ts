import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';

describe('AnalyticsController', () => {
  let analyticsController: AnalyticsController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
    }).compile();

    analyticsController = app.get<AnalyticsController>(AnalyticsController);
  });

  describe('root', () => {
    it('should return health status', () => {
      expect(analyticsController.health()).toEqual({ status: 'ok' });
    });
  });
});
