import { Test, TestingModule } from '@nestjs/testing';
import { ProcessorController } from './processor.controller';

describe('ProcessorController', () => {
  let processorController: ProcessorController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ProcessorController],
    }).compile();

    processorController = app.get<ProcessorController>(ProcessorController);
  });

  it('returns health status', () => {
    expect(processorController.health()).toEqual({ status: 'ok' });
  });
});
