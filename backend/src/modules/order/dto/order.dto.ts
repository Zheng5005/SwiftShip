import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { OrderStatus } from '../../../entities/order.entity';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  @IsString()
  @IsNotEmpty()
  dropoffAddress: string;
}

export class UpdateOrderDto {
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsString()
  pickupAddress?: string;

  @IsString()
  dropoffAddress?: string;
}
