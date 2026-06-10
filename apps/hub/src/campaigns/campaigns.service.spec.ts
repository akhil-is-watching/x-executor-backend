import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { NatsJsService } from '@app/nats-js';
import { Campaign } from '../schemas/campaign.schema';
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
    createdAt,
    updatedAt,
  };

  const campaignModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
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

  describe('getStatus', () => {
    it('includes campaign name in status response', async () => {
      campaignModel.findOne.mockResolvedValue(campaignDoc);

      const result = await service.getStatus(
        orgId.toString(),
        campaignId.toString(),
      );

      expect(result.name).toBe('Q1 outreach');
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
