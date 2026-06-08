export interface CampaignDmReadyEvent {
  jobId: string;
  campaignId: string;
  orgId: string;
  connectionId: string;
  xUserId: string;
  recipientUsername: string;
  messageText: string;
}
