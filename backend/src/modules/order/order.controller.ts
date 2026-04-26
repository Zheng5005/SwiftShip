import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto, UpdateOrderDto } from './dto/order.dto';
import { JwtAuthGuard, RolesGuard, ROLES_KEY } from '../auth/guards';
import { Roles } from './decorators/roles.decorator';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @Roles('user')
  create(@Body() dto: CreateOrderDto, @Request() req) {
    return this.orderService.create(dto, req.user);
  }

  @Get()
  findAll(@Request() req) {
    return this.orderService.findAll(req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.orderService.findOne(id, req.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto, @Request() req) {
    return this.orderService.update(id, dto, req.user);
  }
}
