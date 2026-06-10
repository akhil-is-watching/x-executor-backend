import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CampaignDocument = HydratedDocument<Campaign>;

export type CampaignStatus = 'pending' | 'running' | 'completed' | 'failed';

@Schema({ timestamps: true, collection: 'campaigns' })
export class Campaign {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId!: Types.ObjectId;

  @Prop({ trim: true, maxlength: 100 })
  name?: string;

  @Prop({
    required: true,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
  })
  status!: CampaignStatus;

  @Prop({ required: true })
  messageText!: string;

  @Prop({ type: [String], required: true })
  targetUsernames!: string[];

  @Prop({ required: true })
  totalTargets!: number;

  @Prop({ default: 0 })
  messagesSent!: number;

  @Prop({ default: 0 })
  messagesScheduled!: number;

  @Prop({ default: 0 })
  repliesReceived!: number;

  @Prop({ default: 0 })
  failedCount!: number;

  @Prop()
  startedAt?: Date;

  @Prop()
  expectedEndAt?: Date;

  @Prop()
  completedAt?: Date;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);
CampaignSchema.index({ orgId: 1, createdAt: -1 });
