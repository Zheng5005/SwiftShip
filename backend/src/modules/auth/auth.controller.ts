import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { RegisterCourierDto } from './dto/register-courier.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/user')
  registerUser(@Body() dto: RegisterUserDto) {
    return this.authService.registerUser(dto);
  }

  @Post('register/courier')
  registerCourier(@Body() dto: RegisterCourierDto) {
    return this.authService.registerCourier(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
