import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PASSWORD_PATTERN =
  /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&._-]{8,}$/;

const NAME_PATTERN = /^[A-Za-z\s.'-]+$/;

export class SignUpDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(120, { message: 'Full name cannot exceed 120 characters' })
  @Matches(NAME_PATTERN, {
    message: 'Full name can only contain letters, spaces, apostrophes, periods and hyphens',
  })
  name!: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @MaxLength(255, { message: 'Email cannot exceed 255 characters' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password cannot exceed 72 characters' })
  @Matches(PASSWORD_PATTERN, {
    message:
      'Password must contain at least one letter and one number, and only letters, numbers, or the special characters @ $ ! % * # ? & . _ -',
  })
  password!: string;
}

export class UserResponse {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsString()
  authProvider?: 'email' | 'google' | 'microsoft' | 'linkedin';

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  isEmailVerified?: boolean;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  hasCompany?: boolean;

  @IsString()
  @IsOptional()
  createdAt?: Date;

  @IsOptional()
  @IsString()
  updatedAt?: Date;
}