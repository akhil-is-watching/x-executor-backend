import { Test, TestingModule } from '@nestjs/testing';
import { SenderController } from './sender.controller';
import { SenderService } from './sender.service';

describe('SenderController', () => {
  let senderController: SenderController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SenderController],
      providers: [SenderService],
    }).compile();

    senderController = app.get<SenderController>(SenderController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(senderController.getHello()).toBe('Hello World!');
    });
  });
});
