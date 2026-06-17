import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProxyAssignmentDocument = HydratedDocument<ProxyAssignment>;

export type ProxyAssignmentStatus = 'active' | 'cooldown' | 'released';

export const PROXY_COOLDOWN_DAYS = 7;

@Schema({ timestamps: true, collection: 'proxy_assignments' })
export class ProxyAssignment {
  @Prop({ required: true })
  xUserId!: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId!: Types.ObjectId;

  @Prop({ required: true })
  proxyId!: string;

  @Prop({ required: true })
  proxyAddress!: string;

  @Prop({ required: true })
  proxyUrlEnc!: string;

  @Prop({
    required: true,
    enum: ['active', 'cooldown', 'released'],
    default: 'active',
  })
  status!: ProxyAssignmentStatus;

  @Prop()
  releasedAt?: Date;
}

export const ProxyAssignmentSchema =
  SchemaFactory.createForClass(ProxyAssignment);

ProxyAssignmentSchema.index({ xUserId: 1 }, { unique: true });
ProxyAssignmentSchema.index({ status: 1 });
ProxyAssignmentSchema.index({ status: 1, releasedAt: 1 });
