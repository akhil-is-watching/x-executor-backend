import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NATS_DLQ_STREAM_NAME,
  NATS_DLQ_STREAM_SUBJECTS,
  NATS_STREAM_NAME,
  NATS_STREAM_SUBJECTS,
  NATS_SUBJECT_WEBHOOK_RECEIVED,
} from './nats.constants';
import { NatsJsService } from './nats-js.service';

const mockPublish = jest.fn();
const mockConsume = jest.fn(async function* () {
  return;
});
const mockConsumerGet = jest.fn(async () => ({
  consume: mockConsume,
}));
const mockJetstream = jest.fn(() => ({
  publish: mockPublish,
  consumers: { get: mockConsumerGet },
}));
const mockStreamsAdd = jest.fn();
const mockStreamsUpdate = jest.fn();
const mockStreamsInfo = jest.fn().mockRejectedValue(new Error('not found'));
const mockJetstreamManager = jest.fn(async () => ({
  streams: {
    info: mockStreamsInfo,
    add: mockStreamsAdd,
    update: mockStreamsUpdate,
  },
  consumers: {
    info: jest.fn().mockRejectedValue(new Error('not found')),
    add: jest.fn(),
  },
}));
const mockDrain = jest.fn();
const mockConnect = jest.fn(async (_options: { servers: string }) => ({
  jetstream: mockJetstream,
  jetstreamManager: mockJetstreamManager,
  drain: mockDrain,
}));

jest.mock('nats', () => ({
  connect: (options: { servers: string }) => mockConnect(options),
  RetentionPolicy: { Limits: 'limits' },
  StorageType: { File: 'file' },
  AckPolicy: { Explicit: 'explicit' },
  DeliverPolicy: { All: 'all' },
}));

describe('NatsJsService', () => {
  let service: NatsJsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockStreamsInfo.mockRejectedValue(new Error('not found'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NatsJsService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (name: string) => {
              if (name === 'NATS_URL') return 'nats://localhost:4222';
              throw new Error(name);
            },
          },
        },
      ],
    }).compile();

    service = module.get(NatsJsService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('connects and ensures primary + DLQ streams on init', () => {
    expect(mockConnect).toHaveBeenCalledWith({ servers: 'nats://localhost:4222' });
    expect(mockStreamsAdd).toHaveBeenCalledTimes(2);
    expect(mockStreamsAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        name: NATS_STREAM_NAME,
        subjects: [...NATS_STREAM_SUBJECTS],
      }),
    );
    expect(mockStreamsAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        name: NATS_DLQ_STREAM_NAME,
        subjects: [...NATS_DLQ_STREAM_SUBJECTS],
      }),
    );
  });

  it('publishJson stringifies and publishes', async () => {
    await service.publishJson(NATS_SUBJECT_WEBHOOK_RECEIVED, { eventId: '1' });
    expect(mockPublish).toHaveBeenCalledWith(
      NATS_SUBJECT_WEBHOOK_RECEIVED,
      JSON.stringify({ eventId: '1' }),
    );
  });

  it('drains connection on destroy', async () => {
    await service.onModuleDestroy();
    expect(mockDrain).toHaveBeenCalled();
  });
});
