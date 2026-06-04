import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrganizationMembershipDocument =
  HydratedDocument<OrganizationMembership>;

export enum OrgRole {
  Owner = 'owner',
  Admin = 'admin',
}

@Schema({ timestamps: true, collection: 'organization_memberships' })
export class OrganizationMembership {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  orgId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: OrgRole })
  role!: OrgRole;
}

export const OrganizationMembershipSchema = SchemaFactory.createForClass(
  OrganizationMembership,
);
OrganizationMembershipSchema.index({ orgId: 1, userId: 1 }, { unique: true });
