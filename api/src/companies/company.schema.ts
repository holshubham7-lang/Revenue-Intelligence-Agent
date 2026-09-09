import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type CompanyDocument = HydratedDocument<Company>;

@Schema({
  collection: 'companies',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
  toJSON: {
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Company {
  _id!: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  name!: string;

  @Prop({ type: String, trim: true, maxlength: 255 })
  website?: string;

  @Prop({ type: String, trim: true, maxlength: 120 })
  industry?: string;

  @Prop({ type: String, trim: true, maxlength: 60 })
  companySize?: string;

  @Prop({ type: String, trim: true, maxlength: 80 })
  country?: string;

  @Prop({ type: String, trim: true, maxlength: 60 })
  revenueRange?: string;

  @Prop({ type: String, trim: true, maxlength: 12000 })
  problemStatement?: string;

  @Prop({
    type: {
      questions: { type: [String] },
      answers: { type: [String] },
      result: { type: String },
      createdAt: { type: Date },
    },
  })
  assessment?: {
    questions?: string[];
    answers?: string[];
    result?: string;
    createdAt?: Date;
  };

  @Prop({ type: Date })
  createdAt?: Date;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
