import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CampaignJobDocument = HydratedDocument<CampaignJob>;

export type CampaignJobStatus = 'pending' | 'dispatched' | 'sent' | 'failed';

@Schema({ timestamps: true, collection: 'campaign_jobs' })
export class CampaignJob {
  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'XConnection', required: true })
  connectionId!: Types.ObjectId;

  @Prop({ required: true })
  xUserId!: string;

  @Prop({ required: true })
  recipientUsername!: string;

  @Prop()
  recipientXUserId?: string;

  @Prop({ required: true })
  messageText!: string;

  @Prop({
    required: true,
    enum: ['pending', 'dispatched', 'sent', 'failed'],
    default: 'pending',
  })
  status!: CampaignJobStatus;

  @Prop({ required: true })
  scheduledAt!: Date;

  @Prop()
  dispatchedAt?: Date;

  @Prop()
  sentAt?: Date;

  @Prop()
  failedAt?: Date;

  @Prop()
  error?: string;

  @Prop()
  dmId?: string;

  @Prop({ default: false })
  replyReceived!: boolean;
}

export const CampaignJobSchema = SchemaFactory.createForClass(CampaignJob);
CampaignJobSchema.index({ status: 1, scheduledAt: 1 });
CampaignJobSchema.index({ campaignId: 1, status: 1 });
CampaignJobSchema.index({ connectionId: 1, scheduledAt: 1 });
CampaignJobSchema.index({ orgId: 1, recipientXUserId: 1, status: 1 });
CampaignJobSchema.index({ connectionId: 1, recipientXUserId: 1, status: 1 });
