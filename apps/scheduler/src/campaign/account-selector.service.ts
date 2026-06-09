import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomInt } from 'crypto';
import {
  CampaignJob,
  CampaignJobDocument,
} from '../schemas/campaign-job.schema';

export interface AccountCandidate {
  connectionId: string;
  xUserId: string;
}

export interface PlannedJobInput {
  campaignId: string;
  orgId: string;
  messageText: string;
  hourlyLimitOverride?: number;
}

export interface PlannedJob {
  campaignId: string;
  orgId: string;
  connectionId: string;
  xUserId: string;
  recipientUsername: string;
  messageText: string;
  scheduledAt: Date;
}

interface AccountSendCounts {
  lastHour: number;
  today: number;
}

@Injectable()
export class AccountSelectorService {
  private readonly hourlyLimit: number;
  private readonly dailyLimit: number;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly globalMinGapMs: number;

  constructor(
    @InjectModel(CampaignJob.name)
    private readonly campaignJobModel: Model<CampaignJobDocument>,
    private readonly config: ConfigService,
  ) {
    this.hourlyLimit = readPositiveInt(
      config,
      'CAMPAIGN_HOURLY_LIMIT_PER_ACCOUNT',
      15,
    );
    this.dailyLimit = readPositiveInt(
      config,
      'CAMPAIGN_DAILY_LIMIT_PER_ACCOUNT',
      80,
    );
    this.minDelayMs = readPositiveInt(config, 'CAMPAIGN_MIN_SEND_DELAY_MS', 90_000);
    this.maxDelayMs = readPositiveInt(
      config,
      'CAMPAIGN_MAX_SEND_DELAY_MS',
      300_000,
    );
    this.globalMinGapMs = readPositiveInt(
      config,
      'CAMPAIGN_GLOBAL_MIN_GAP_MS',
      5_000,
    );
  }

  async planJobs(
    accounts: AccountCandidate[],
    targetUsernames: string[],
    input: PlannedJobInput,
  ): Promise<PlannedJob[]> {
    if (accounts.length === 0) {
      throw new Error('No eligible accounts with auth tokens available');
    }

    const effectiveHourlyLimit =
      input.hourlyLimitOverride ?? this.hourlyLimit;

    const sendCounts = await this.loadSendCounts(accounts);
    const shuffledTargets = shuffle(targetUsernames);
    const accountNextTime = new Map<string, number>();
    for (const account of accounts) {
      accountNextTime.set(account.connectionId, Date.now());
    }

    let globalCursor = Date.now();
    const planned: PlannedJob[] = [];

    for (const recipientUsername of shuffledTargets) {
      let assigned = false;
      let safetyAttempts = 0;

      while (!assigned && safetyAttempts < 10_000) {
        safetyAttempts += 1;

        const eligible = accounts.filter((account) => {
          const counts = sendCounts.get(account.connectionId) ?? {
            lastHour: 0,
            today: 0,
          };
          const plannedForAccount = planned.filter(
            (job) => job.connectionId === account.connectionId,
          ).length;

          return (
            counts.lastHour + plannedForAccount < effectiveHourlyLimit &&
            counts.today + plannedForAccount < this.dailyLimit
          );
        });

        if (eligible.length === 0) {
          globalCursor += this.minDelayMs;
          continue;
        }

        const weights = eligible.map((account) => {
          const counts = sendCounts.get(account.connectionId) ?? {
            lastHour: 0,
            today: 0,
          };
          const plannedForAccount = planned.filter(
            (job) => job.connectionId === account.connectionId,
          ).length;
          return 1 / (1 + counts.lastHour + plannedForAccount);
        });

        const picked = weightedRandomSelect(eligible, weights);
        const delayMs = randomInt(this.minDelayMs, this.maxDelayMs + 1);
        const accountEarliest = accountNextTime.get(picked.connectionId) ?? globalCursor;
        const scheduledAtMs = Math.max(
          accountEarliest,
          globalCursor + this.globalMinGapMs,
        );

        planned.push({
          campaignId: input.campaignId,
          orgId: input.orgId,
          connectionId: picked.connectionId,
          xUserId: picked.xUserId,
          recipientUsername,
          messageText: input.messageText,
          scheduledAt: new Date(scheduledAtMs),
        });

        accountNextTime.set(picked.connectionId, scheduledAtMs + delayMs);
        globalCursor = scheduledAtMs;
        assigned = true;
      }

      if (!assigned) {
        throw new Error(
          `Unable to schedule job for @${recipientUsername} within safety limits`,
        );
      }
    }

    return planned;
  }

  private async loadSendCounts(
    accounts: AccountCandidate[],
  ): Promise<Map<string, AccountSendCounts>> {
    const connectionIds = accounts.map(
      (account) => new Types.ObjectId(account.connectionId),
    );
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const activeStatuses = ['pending', 'dispatched', 'sent'];

    const rows = await this.campaignJobModel.aggregate<{
      _id: Types.ObjectId;
      lastHour: number;
      today: number;
    }>([
      {
        $match: {
          connectionId: { $in: connectionIds },
          status: { $in: activeStatuses },
          scheduledAt: { $gte: startOfDay },
        },
      },
      {
        $group: {
          _id: '$connectionId',
          lastHour: {
            $sum: {
              $cond: [{ $gte: ['$scheduledAt', oneHourAgo] }, 1, 0],
            },
          },
          today: { $sum: 1 },
        },
      },
    ]);

    const counts = new Map<string, AccountSendCounts>();
    for (const row of rows) {
      counts.set(row._id.toString(), {
        lastHour: row.lastHour,
        today: row.today,
      });
    }

    return counts;
  }
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function weightedRandomSelect<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let threshold = randomInt(0, Math.max(total, 1));

  for (let i = 0; i < items.length; i += 1) {
    threshold -= weights[i];
    if (threshold < 0) {
      return items[i];
    }
  }

  return items[items.length - 1];
}

function readPositiveInt(
  config: ConfigService,
  name: string,
  fallback: number,
): number {
  const raw = config.get<string>(name);
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
