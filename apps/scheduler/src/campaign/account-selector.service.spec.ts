import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { CampaignJob } from '../schemas/campaign-job.schema';
import { AccountSelectorService } from './account-selector.service';

describe('AccountSelectorService', () => {
  let service: AccountSelectorService;

  const campaignJobModel = {
    aggregate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    campaignJobModel.aggregate.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountSelectorService,
        {
          provide: getModelToken(CampaignJob.name),
          useValue: campaignJobModel,
        },
        {
          provide: ConfigService,
          useValue: {
            get: () => undefined,
          },
        },
      ],
    }).compile();

    service = module.get(AccountSelectorService);
  });

  describe('pickLeastLoadedAccounts', () => {
    const accounts = [
      { connectionId: 'conn-a', xUserId: 'user-a' },
      { connectionId: 'conn-b', xUserId: 'user-b' },
      { connectionId: 'conn-c', xUserId: 'user-c' },
    ];

    it('returns all accounts when limit is greater than or equal to pool size', async () => {
      const result = await service.pickLeastLoadedAccounts(accounts, 5);

      expect(result).toEqual(accounts);
      expect(campaignJobModel.aggregate).not.toHaveBeenCalled();
    });

    it('returns all accounts when limit equals pool size', async () => {
      const result = await service.pickLeastLoadedAccounts(accounts, 3);

      expect(result).toEqual(accounts);
      expect(campaignJobModel.aggregate).not.toHaveBeenCalled();
    });

    it('returns empty array when given no accounts', async () => {
      const result = await service.pickLeastLoadedAccounts([], 2);

      expect(result).toEqual([]);
      expect(campaignJobModel.aggregate).not.toHaveBeenCalled();
    });

    it('picks least-loaded accounts by recent send counts', async () => {
      campaignJobModel.aggregate.mockResolvedValue([
        {
          _id: new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
          lastHour: 5,
          today: 10,
        },
        {
          _id: new Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
          lastHour: 1,
          today: 2,
        },
        {
          _id: new Types.ObjectId('cccccccccccccccccccccccc'),
          lastHour: 0,
          today: 1,
        },
      ]);

      const loadedAccounts = [
        { connectionId: 'aaaaaaaaaaaaaaaaaaaaaaaa', xUserId: 'user-a' },
        { connectionId: 'bbbbbbbbbbbbbbbbbbbbbbbb', xUserId: 'user-b' },
        { connectionId: 'cccccccccccccccccccccccc', xUserId: 'user-c' },
      ];

      const result = await service.pickLeastLoadedAccounts(loadedAccounts, 2);

      expect(result).toEqual([
        { connectionId: 'cccccccccccccccccccccccc', xUserId: 'user-c' },
        { connectionId: 'bbbbbbbbbbbbbbbbbbbbbbbb', xUserId: 'user-b' },
      ]);
    });

    it('uses connectionId as a stable tie-breaker', async () => {
      campaignJobModel.aggregate.mockResolvedValue([
        {
          _id: new Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
          lastHour: 1,
          today: 1,
        },
        {
          _id: new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
          lastHour: 1,
          today: 1,
        },
      ]);

      const tiedAccounts = [
        { connectionId: 'bbbbbbbbbbbbbbbbbbbbbbbb', xUserId: 'user-b' },
        { connectionId: 'aaaaaaaaaaaaaaaaaaaaaaaa', xUserId: 'user-a' },
      ];

      const result = await service.pickLeastLoadedAccounts(tiedAccounts, 1);

      expect(result).toEqual([
        { connectionId: 'aaaaaaaaaaaaaaaaaaaaaaaa', xUserId: 'user-a' },
      ]);
    });
  });
});
