import { IsString, IsBoolean, IsNumber, IsOptional } from 'class-validator';

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
  @IsString({ each: true })
  scopes?: string[];

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
  azureConnectionName?: string;

  @IsOptional()
  @IsString()
  azureConnectionId?: string;

  @IsOptional()
  @IsString()
  azureResourceGroup?: string;

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