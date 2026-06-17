import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { NatsJsService } from '@app/nats-js';
import { Campaign } from '../schemas/campaign.schema';
import { CampaignJob } from '../schemas/campaign-job.schema';
import { XConnection } from '../schemas/x-connection.schema';
import { CampaignsService } from './campaigns.service';

describe('CampaignsService', () => {
  let service: CampaignsService;

  const orgId = new Types.ObjectId();
  const campaignId = new Types.ObjectId();
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');

  const campaignDoc = {
    _id: campaignId,
    orgId,
    name: 'Q1 outreach',
    status: 'running',
    messageText: 'Hello',
    targetUsernames: ['alice'],
    totalTargets: 1,
    dmsPerHour: 15,
    messagesSent: 0,
    messagesScheduled: 1,
    repliesReceived: 0,
    failedCount: 0,
    cancelledCount: 0,
    createdAt,
    updatedAt,
  };

  const campaignModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const campaignJobModel = {
    updateMany: jest.fn(),
  };

  const connectionModel = {
    countDocuments: jest.fn().mockResolvedValue(2),
  };

  const natsJs = {
    publishJson: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        {
          provide: getModelToken(Campaign.name),
          useValue: campaignModel,
        },
        {
          provide: getModelToken(CampaignJob.name),
          useValue: campaignJobModel,
        },
        {
          provide: getModelToken(XConnection.name),
          useValue: connectionModel,
        },
        {
          provide: NatsJsService,
          useValue: natsJs,
        },
      ],
    }).compile();

    service = module.get(CampaignsService);
  });

  describe('create', () => {
    it('persists campaign name and returns it in the response', async () => {
      campaignModel.create.mockResolvedValue({
        ...campaignDoc,
        status: 'pending',
        messagesScheduled: 0,
      });

      const result = await service.create(orgId.toString(), {
        name: '  Q1 outreach  ',
        targetUsernames: ['@alice'],
        messageText: 'Hello',
      });

      expect(campaignModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId,
          name: 'Q1 outreach',
        }),
      );
      expect(result.name).toBe('Q1 outreach');
      expect(natsJs.publishJson).toHaveBeenCalled();
    });

    it('throws when no valid target usernames remain', async () => {
      await expect(
        service.create(orgId.toString(), {
          name: 'Empty targets',
          targetUsernames: ['  ', '@'],
          messageText: 'Hello',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('persists accountsToUse when provided', async () => {
      campaignModel.create.mockResolvedValue({
        ...campaignDoc,
        status: 'pending',
        messagesScheduled: 0,
        accountsToUse: 2,
      });

      const result = await service.create(orgId.toString(), {
        name: 'Limited accounts',
        targetUsernames: ['@alice'],
        messageText: 'Hello',
        accountsToUse: 2,
      });

      expect(campaignModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accountsToUse: 2,
        }),
      );
      expect(result.accountsToUse).toBe(2);
    });

    it('rejects accountsToUse greater than eligible connections', async () => {
      connectionModel.countDocuments.mockResolvedValue(1);

      await expect(
        service.create(orgId.toString(), {
          name: 'Too many accounts',
          targetUsernames: ['alice'],
          messageText: 'Hello',
          accountsToUse: 3,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('persists connectionIds when provided', async () => {
      const connA = new Types.ObjectId();
      const connB = new Types.ObjectId();
      connectionModel.countDocuments.mockResolvedValue(2);
      connectionModel.countDocuments
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2);

      campaignModel.create.mockResolvedValue({
        ...campaignDoc,
        status: 'pending',
        messagesScheduled: 0,
        connectionIds: [connA, connB],
        accountsToUse: 2,
      });

      const result = await service.create(orgId.toString(), {
        name: 'Selected accounts',
        targetUsernames: ['alice'],
        messageText: 'Hello',
        connectionIds: [connA.toString(), connB.toString()],
      });

      expect(campaignModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionIds: [connA, connB],
          accountsToUse: 2,
        }),
      );
      expect(result.connectionIds).toEqual([connA.toString(), connB.toString()]);
    });

    it('rejects invalid connectionIds', async () => {
      connectionModel.countDocuments.mockResolvedValue(2);

      await expect(
        service.create(orgId.toString(), {
          name: 'Bad selection',
          targetUsernames: ['alice'],
          messageText: 'Hello',
          connectionIds: ['not-a-valid-id'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects ineligible connectionIds', async () => {
      connectionModel.countDocuments.mockResolvedValue(2);
      connectionModel.countDocuments
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);

      await expect(
        service.create(orgId.toString(), {
          name: 'Missing account',
          targetUsernames: ['alice'],
          messageText: 'Hello',
          connectionIds: [
            new Types.ObjectId().toString(),
            new Types.ObjectId().toString(),
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects create when no eligible connections exist', async () => {
      connectionModel.countDocuments.mockResolvedValue(0);

      await expect(
        service.create(orgId.toString(), {
          name: 'No accounts',
          targetUsernames: ['alice'],
          messageText: 'Hello',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listForOrg', () => {
    it('returns campaign summaries for the org', async () => {
      const older = {
        ...campaignDoc,
        _id: new Types.ObjectId(),
        name: 'Older campaign',
        createdAt: new Date('2025-12-01T00:00:00.000Z'),
      };
      campaignModel.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([campaignDoc, older]),
      });

      const result = await service.listForOrg(orgId.toString());

      expect(campaignModel.find).toHaveBeenCalledWith({ orgId });
      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('Q1 outreach');
      expect(result[0]?.progressPercent).toBe(0);
    });
  });

  describe('updateName', () => {
    it('updates campaign name', async () => {
      campaignModel.findOneAndUpdate.mockResolvedValue({
        ...campaignDoc,
        name: 'Renamed campaign',
      });

      const result = await service.updateName(
        orgId.toString(),
        campaignId.toString(),
        '  Renamed campaign  ',
      );

      expect(campaignModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: campaignId,
          orgId,
        },
        { $set: { name: 'Renamed campaign' } },
        { returnDocument: 'after' },
      );
      expect(result).toEqual({
        id: campaignId.toString(),
        name: 'Renamed campaign',
        updatedAt,
      });
    });

    it('throws when campaign is not found', async () => {
      campaignModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.updateName(orgId.toString(), campaignId.toString(), 'New name'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('pause', () => {
    it('pauses a running campaign', async () => {
      campaignModel.findOne.mockResolvedValue(campaignDoc);
      campaignModel.findOneAndUpdate.mockResolvedValue({
        ...campaignDoc,
        status: 'paused',
      });

      const result = await service.pause(orgId.toString(), campaignId.toString());

      expect(campaignModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: campaignId, orgId, status: 'running' },
        { $set: { status: 'paused' } },
        { returnDocument: 'after' },
      );
      expect(result.status).toBe('paused');
    });

    it('rejects pause when campaign is not running', async () => {
      campaignModel.findOne.mockResolvedValue({
        ...campaignDoc,
        status: 'completed',
      });

      await expect(
        service.pause(orgId.toString(), campaignId.toString()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resume', () => {
    it('resumes a paused campaign', async () => {
      campaignModel.findOne.mockResolvedValue({
        ...campaignDoc,
        status: 'paused',
      });
      campaignModel.findOneAndUpdate.mockResolvedValue({
        ...campaignDoc,
        status: 'running',
      });

      const result = await service.resume(orgId.toString(), campaignId.toString());

      expect(campaignModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: campaignId, orgId, status: 'paused' },
        { $set: { status: 'running' } },
        { returnDocument: 'after' },
      );
      expect(result.status).toBe('running');
    });

    it('rejects resume when campaign is not paused', async () => {
      campaignModel.findOne.mockResolvedValue(campaignDoc);

      await expect(
        service.resume(orgId.toString(), campaignId.toString()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('stop', () => {
    it('stops a running campaign and cancels pending jobs', async () => {
      campaignModel.findOne.mockResolvedValue(campaignDoc);
      campaignJobModel.updateMany.mockResolvedValue({ modifiedCount: 3 });
      const stoppedAt = new Date('2026-01-03T00:00:00.000Z');
      campaignModel.findOneAndUpdate.mockResolvedValue({
        ...campaignDoc,
        status: 'stopped',
        cancelledCount: 3,
        completedAt: stoppedAt,
        stoppedAt,
      });

      const result = await service.stop(orgId.toString(), campaignId.toString());

      expect(campaignJobModel.updateMany).toHaveBeenCalledWith(
        { campaignId, status: 'pending' },
        { $set: { status: 'cancelled' } },
      );
      expect(campaignModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: campaignId, orgId },
        {
          $set: {
            status: 'stopped',
            completedAt: expect.any(Date),
            stoppedAt: expect.any(Date),
          },
          $inc: { cancelledCount: 3 },
        },
        { returnDocument: 'after' },
      );
      expect(result.status).toBe('stopped');
      expect(result.cancelledCount).toBe(3);
    });

    it('rejects stop when campaign is already completed', async () => {
      campaignModel.findOne.mockResolvedValue({
        ...campaignDoc,
        status: 'completed',
      });

      await expect(
        service.stop(orgId.toString(), campaignId.toString()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStatus', () => {
    it('includes campaign name in status response', async () => {
      campaignModel.findOne.mockResolvedValue(campaignDoc);

      const result = await service.getStatus(
        orgId.toString(),
        campaignId.toString(),
      );

      expect(result.name).toBe('Q1 outreach');
    });

    it('includes cancelledCount in remaining calculation', async () => {
      campaignModel.findOne.mockResolvedValue({
        ...campaignDoc,
        totalTargets: 10,
        messagesSent: 2,
        failedCount: 1,
        cancelledCount: 3,
      });

      const result = await service.getStatus(
        orgId.toString(),
        campaignId.toString(),
      );

      expect(result.cancelledCount).toBe(3);
      expect(result.remaining).toBe(4);
      expect(result.progressPercent).toBe(60);
    });

    it('falls back to untitled when name is missing', async () => {
      campaignModel.findOne.mockResolvedValue({
        ...campaignDoc,
        name: undefined,
      });

      const result = await service.getStatus(
        orgId.toString(),
        campaignId.toString(),
      );

      expect(result.name).toBe('Untitled campaign');
    });
  });
});
