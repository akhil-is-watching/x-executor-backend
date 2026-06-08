export type CampaignAnalyticsType = 'dm_sent' | 'dm_failed' | 'reply_received';

export interface CampaignAnalyticsEvent {
  campaignId: string;
  orgId: string;
  jobId: string;
  type: CampaignAnalyticsType;
  recipientXUserId?: string;
  error?: string;
  occurredAt: string;
}
