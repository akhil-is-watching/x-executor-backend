import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CampaignDocument = HydratedDocument<Campaign>;

export type CampaignStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed';

export const CAMPAIGN_STATUSES = [
  'pending',
  'running',
  'paused',
  'stopped',
  'completed',
  'failed',
] as const;

@Schema({ timestamps: true, collection: 'campaigns' })
export class Campaign {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId!: Types.ObjectId;

  @Prop({ trim: true, maxlength: 100 })
  name?: string;

  @Prop({
    required: true,
    enum: CAMPAIGN_STATUSES,
    default: 'pending',
  })
  status!: CampaignStatus;

  @Prop({ required: true })
  messageText!: string;

  @Prop({ type: [String], required: true })
  targetUsernames!: string[];

  @Prop({ required: true })
  totalTargets!: number;

  @Prop({ min: 1 })
  accountsToUse?: number;

  @Prop({ type: [Types.ObjectId], ref: 'XConnection', default: undefined })
  connectionIds?: Types.ObjectId[];

  @Prop({ default: 0 })
  messagesSent!: number;

  @Prop({ default: 0 })
  messagesScheduled!: number;

  @Prop({ default: 0 })
  repliesReceived!: number;

  @Prop({ default: 0 })
  failedCount!: number;

  @Prop({ default: 0 })
  cancelledCount!: number;

  @Prop()
  startedAt?: Date;

  @Prop()
  expectedEndAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  stoppedAt?: Date;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);
CampaignSchema.index({ orgId: 1, createdAt: -1 });
