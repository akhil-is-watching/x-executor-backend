import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { NATS_SUBJECT_CAMPAIGN_DM_READY, NatsJsService } from '@app/nats-js';
import { Campaign } from '../schemas/campaign.schema';
import { CampaignJob } from '../schemas/campaign-job.schema';
import { JobDispatcherService } from './job-dispatcher.service';

describe('JobDispatcherService', () => {
  let service: JobDispatcherService;

  const campaignId = new Types.ObjectId();
  const orgId = new Types.ObjectId();
  const connectionId = new Types.ObjectId();
  const jobId = new Types.ObjectId();

  const dueJob = {
    _id: jobId,
    campaignId,
    orgId,
    connectionId,
    xUserId: '123',
    recipientUsername: 'alice',
    messageText: 'Hello',
    status: 'pending',
    scheduledAt: new Date('2020-01-01T00:00:00.000Z'),
  };

  const campaignJobModel = {
    find: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };

  const campaignModel = {
    find: jest.fn(),
  };

  const natsJs = {
    publishJson: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    campaignJobModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([dueJob]),
      }),
    });
    campaignModel.find.mockResolvedValue([{ _id: campaignId, status: 'running' }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobDispatcherService,
        { provide: getModelToken(CampaignJob.name), useValue: campaignJobModel },
        { provide: getModelToken(Campaign.name), useValue: campaignModel },
        { provide: NatsJsService, useValue: natsJs },
      ],
    }).compile();

    service = module.get(JobDispatcherService);
  });

  it('dispatches due jobs for running campaigns', async () => {
    await service.dispatchDueJobs();

    expect(natsJs.publishJson).toHaveBeenCalledWith(
      NATS_SUBJECT_CAMPAIGN_DM_READY,
      expect.objectContaining({
        jobId: jobId.toString(),
        campaignId: campaignId.toString(),
        recipientUsername: 'alice',
      }),
    );
    expect(campaignJobModel.updateOne).toHaveBeenCalledWith(
      { _id: jobId, status: 'pending' },
      {
        $set: {
          status: 'dispatched',
          dispatchedAt: expect.any(Date),
        },
      },
    );
  });

  it('skips due jobs when campaign is not running', async () => {
    campaignModel.find.mockResolvedValue([]);

    await service.dispatchDueJobs();

    expect(natsJs.publishJson).not.toHaveBeenCalled();
    expect(campaignJobModel.updateOne).not.toHaveBeenCalled();
  });
});
