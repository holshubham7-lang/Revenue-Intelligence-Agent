import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const NAME_PATTERN = /^[A-Za-z\s.'-]+$/;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Full name cannot be empty' })
  @MinLength(2, { message: 'Full name must be at least 2 characters' })
  @MaxLength(120, { message: 'Full name cannot exceed 120 characters' })
  @Matches(NAME_PATTERN, {
    message:
      'Full name can only contain letters, spaces, apostrophes, periods and hyphens',
  })
  name?: string;
}
