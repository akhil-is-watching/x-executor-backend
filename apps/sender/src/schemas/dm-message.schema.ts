import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DmMessageDocument = HydratedDocument<DmMessage>;

export type DmMessageDirection = 'inbound' | 'outbound';

@Schema({ timestamps: true, collection: 'dm_messages' })
export class DmMessage {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'XConnection', required: true })
  connectionId!: Types.ObjectId;

  @Prop({ required: true })
  xUserId!: string;

  @Prop({ required: true })
  xUsername!: string;

  @Prop({ required: true })
  conversationId!: string;

  @Prop({ required: true })
  recipientId!: string;

  @Prop()
  recipientUsername?: string;

  @Prop({ required: true, enum: ['inbound', 'outbound'] })
  direction!: DmMessageDirection;

  @Prop({ required: true })
  text!: string;

  @Prop()
  isKnownAnswer?: boolean;

  @Prop({ required: true })
  processedAt!: Date;
}

export const DmMessageSchema = SchemaFactory.createForClass(DmMessage);
DmMessageSchema.index({ orgId: 1, conversationId: 1, processedAt: 1 });
DmMessageSchema.index({ orgId: 1, processedAt: -1 });
