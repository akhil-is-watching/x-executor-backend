export interface CampaignCreatedEvent {
  campaignId: string;
  orgId: string;
  targetUsernames: string[];
  messageText: string;
  createdAt: string;
  dmsPerHour: number;
}
