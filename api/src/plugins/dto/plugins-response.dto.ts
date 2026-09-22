import {
  IsString,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsArray,
  IsObject,
} from 'class-validator';

export class PluginResponse {
  @IsString()
  slug!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  mark?: string;

  @IsOptional()
  @IsString()
  brandColor?: string;

  @IsString()
  source!: string;

  @IsString()
  authType!: string;

  @IsOptional()
  @IsString()
  authMode?: string;

  @IsOptional()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @IsOptional()
  @IsObject()
  normalization?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  iconUrl?: string;
}

export class UserPluginResponse {
  @IsString()
  pluginSlug!: string;

  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  connectorName?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  connectedAt?: Date;

  @IsOptional()
  lastSyncAt?: Date;
}