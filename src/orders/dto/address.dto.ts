import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class AddressDto {
  @ApiProperty({ example: 'Aarav Sharma' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '12 MG Road' })
  @IsString()
  @IsNotEmpty()
  addressLine1!: string;

  @ApiPropertyOptional({ example: 'Near Metro Station' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiProperty({ example: 'Gurugram' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ example: 'Haryana' })
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiProperty({ example: '122001' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  pincode!: string;

  @ApiProperty({ example: 'India', default: 'India' })
  @IsString()
  @IsNotEmpty()
  country!: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(/^\d{10,15}$/)
  phone!: string;

  @ApiPropertyOptional({ example: 'customer@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
