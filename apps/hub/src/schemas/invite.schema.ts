import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InviteDocument = HydratedDocument<Invite>;

@Schema({ timestamps: true, collection: 'invites' })
export class Invite {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  token!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  maxUses?: number;

  @Prop({ default: 0 })
  useCount!: number;

  @Prop()
  revokedAt?: Date;
}

export const InviteSchema = SchemaFactory.createForClass(Invite);
