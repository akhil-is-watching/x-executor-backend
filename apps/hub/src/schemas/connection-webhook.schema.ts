import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConnectionWebhookDocument = HydratedDocument<ConnectionWebhook>;

@Schema({ timestamps: true, collection: 'connection_webhooks' })
export class ConnectionWebhook {
  @Prop({ type: Types.ObjectId, ref: 'XConnection', required: true })
  connectionId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId!: Types.ObjectId;

  @Prop({ required: true })
  xWebhookConfigId!: string;

  @Prop({ default: () => new Date() })
  subscribedAt!: Date;

  @Prop({ default: true })
  active!: boolean;

  @Prop()
  revokedAt?: Date;
}

export const ConnectionWebhookSchema =
  SchemaFactory.createForClass(ConnectionWebhook);
ConnectionWebhookSchema.index(
  { connectionId: 1 },
  { unique: true, partialFilterExpression: { active: true, revokedAt: null } },
);
