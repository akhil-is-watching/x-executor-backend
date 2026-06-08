import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerController } from './scheduler.controller';

describe('SchedulerController', () => {
  let schedulerController: SchedulerController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SchedulerController],
    }).compile();

    schedulerController = app.get<SchedulerController>(SchedulerController);
  });

  describe('root', () => {
    it('should return health status', () => {
      expect(schedulerController.health()).toEqual({ status: 'ok' });
    });
  });
});
