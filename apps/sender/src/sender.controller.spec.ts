import { Test, TestingModule } from '@nestjs/testing';
import { SenderController } from './sender.controller';

describe('SenderController', () => {
  let controller: SenderController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SenderController],
    }).compile();

    controller = module.get(SenderController);
  });

  it('returns health status', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });
});
