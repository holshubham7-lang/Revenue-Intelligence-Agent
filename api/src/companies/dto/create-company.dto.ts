import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const COMPANY_NAME_PATTERN = /^[A-Za-z0-9\s.,&'’-]+$/;

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty({ message: 'Company name is required' })
  @MinLength(2, { message: 'Company name must be at least 2 characters' })
  @MaxLength(200, { message: 'Company name cannot exceed 200 characters' })
  @Matches(COMPANY_NAME_PATTERN, {
    message: 'Company name can only contain letters, numbers, spaces and . , & \' -',
  })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Website cannot exceed 255 characters' })
  website?: string;

  @IsString()
  @IsNotEmpty({ message: 'Industry is required' })
  @MaxLength(120, { message: 'Industry cannot exceed 120 characters' })
  industry!: string;

  @IsString()
  @IsNotEmpty({ message: 'Company size is required' })
  @MaxLength(60, { message: 'Company size cannot exceed 60 characters' })
  companySize!: string;

  @IsString()
  @IsNotEmpty({ message: 'Country is required' })
  @MaxLength(80, { message: 'Country cannot exceed 80 characters' })
  country!: string;

  @IsString()
  @IsNotEmpty({ message: 'Revenue range is required' })
  @MaxLength(60, { message: 'Revenue range cannot exceed 60 characters' })
  revenueRange!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000, {
    message: 'Problem statement cannot exceed 12000 characters',
  })
  problemStatement?: string;
}
