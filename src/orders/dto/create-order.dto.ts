import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ArrayMinSize,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { AddressDto } from './address.dto';

export class ParcelDto {
  @ApiProperty({ example: 1.1, description: 'Kilograms' })
  @IsNumber()
  @IsPositive()
  weightKg!: number;

  @ApiProperty({ example: 12, description: 'Centimetres' })
  @IsNumber()
  @IsPositive()
  lengthCm!: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @IsPositive()
  widthCm!: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @IsPositive()
  heightCm!: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  pieces!: number;
}

export class ItemDto {
  @ApiProperty({ example: 'BOOK-001' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 'Books' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'order-1001' })
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @ApiProperty({
    example: 'mock',
    description: 'Registered courier adapter identifier',
  })
  @IsString()
  @IsNotEmpty()
  courierPartner!: string;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  shipper!: AddressDto;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  recipient!: AddressDto;

  @ApiPropertyOptional({ type: AddressDto, description: 'Defaults to shipper' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  returnAddress?: AddressDto;

  @ApiProperty({ type: ParcelDto })
  @ValidateNested()
  @Type(() => ParcelDto)
  parcel!: ParcelDto;

  @ApiProperty({ type: [ItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items!: ItemDto[];

  @ApiProperty({ enum: ['PREPAID', 'COD'], example: 'PREPAID' })
  @IsIn(['PREPAID', 'COD'])
  paymentMode!: 'PREPAID' | 'COD';

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  declaredValue!: number;

  @ApiPropertyOptional({ example: 0, description: 'Required for COD orders' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  collectableValue?: number;

  @ApiProperty({ example: 'INV-1001' })
  @IsString()
  @IsNotEmpty()
  invoiceNumber!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  invoiceDate!: string;

  @ApiPropertyOptional({ example: 'NDD', default: 'NDD' })
  @IsOptional()
  @IsString()
  serviceType?: string;

  @ApiPropertyOptional({ additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
