import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CancelOrderDto {
  @ApiProperty({ example: 'mock' })
  @IsString()
  @IsNotEmpty()
  courierPartner!: string;
}
