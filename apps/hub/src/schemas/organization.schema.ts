import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrganizationDocument = HydratedDocument<Organization>;

@Schema({ timestamps: true, collection: 'organizations' })
export class Organization {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  slug?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop()
  systemPrompt?: string;

  @Prop()
  draftSystemPrompt?: string;

  @Prop()
  promptPublishedAt?: Date;

  @Prop()
  llmModel?: string;

  @Prop()
  draftLlmModel?: string;

  @Prop({ default: false })
  handoffEnabled!: boolean;

  @Prop()
  handoffConfig?: string;

  @Prop()
  handoffMessage?: string;

  @Prop()
  unknownReply?: string;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
