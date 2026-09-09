import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const COMPANY_NAME_PATTERN = /^[A-Za-z0-9\s.,&'’-]+$/;

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Company name cannot be empty' })
  @MinLength(2, { message: 'Company name must be at least 2 characters' })
  @MaxLength(200, { message: 'Company name cannot exceed 200 characters' })
  @Matches(COMPANY_NAME_PATTERN, {
    message:
      'Company name can only contain letters, numbers, spaces and . , & \' -',
  })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Website cannot exceed 255 characters' })
  website?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Industry cannot be empty' })
  @MaxLength(120, { message: 'Industry cannot exceed 120 characters' })
  industry?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Company size cannot be empty' })
  @MaxLength(60, { message: 'Company size cannot exceed 60 characters' })
  companySize?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Country cannot be empty' })
  @MaxLength(80, { message: 'Country cannot exceed 80 characters' })
  country?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Revenue range cannot be empty' })
  @MaxLength(60, { message: 'Revenue range cannot exceed 60 characters' })
  revenueRange?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000, {
    message: 'Problem statement cannot exceed 12000 characters',
  })
  problemStatement?: string;
}
