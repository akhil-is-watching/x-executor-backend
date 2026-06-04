import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type XConnectionDocument = HydratedDocument<XConnection>;

@Schema({ timestamps: true, collection: 'x_connections' })
export class XConnection {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId!: Types.ObjectId;

  @Prop({ required: true })
  xUserId!: string;

  @Prop({ required: true })
  xUsername!: string;

  @Prop({ type: [String], default: [] })
  scopes!: string[];

  @Prop({ required: true })
  accessTokenEnc!: string;

  @Prop()
  authTokenEnc?: string;

  @Prop()
  refreshTokenEnc?: string;

  @Prop()
  tokenExpiresAt?: Date;

  @Prop({ default: () => new Date() })
  connectedAt!: Date;

  @Prop()
  revokedAt?: Date;
}

export const XConnectionSchema = SchemaFactory.createForClass(XConnection);
XConnectionSchema.index({ orgId: 1, xUserId: 1 }, { unique: true });
