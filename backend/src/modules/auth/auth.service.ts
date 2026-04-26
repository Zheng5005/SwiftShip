import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../../entities/user.entity';
import { Courier } from '../../entities/courier.entity';
import { RegisterUserDto } from './dto/register-user.dto';
import { RegisterCourierDto } from './dto/register-courier.dto';
import { LoginDto } from './dto/login.dto';

export type AuthRole = 'user' | 'courier';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Courier)
    private readonly courierRepository: Repository<Courier>,
    private readonly jwtService: JwtService,
  ) {}

  async registerUser(dto: RegisterUserDto) {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({ ...dto, passwordHash });
    const saved = await this.userRepository.save(user);

    const { passwordHash: _, ...result } = saved;
    return result;
  }

  async registerCourier(dto: RegisterCourierDto) {
    const existing = await this.courierRepository.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Courier with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const courier = this.courierRepository.create({ ...dto, passwordHash });
    const saved = await this.courierRepository.save(courier);

    const { passwordHash: _, ...result } = saved;
    return result;
  }

  async login(dto: LoginDto) {
    // Try user first
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (user) {
      const valid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const { passwordHash: _, ...safeUser } = user;
      const payload = { sub: user.id, email: user.email, role: 'user' as AuthRole };
      return {
        user: safeUser,
        access_token: this.jwtService.sign(payload),
      };
    }

    // Try courier
    const courier = await this.courierRepository.findOne({ where: { email: dto.email } });
    if (courier) {
      const valid = await bcrypt.compare(dto.password, courier.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const { passwordHash: _, ...safeCourier } = courier;
      const payload = { sub: courier.id, email: courier.email, role: 'courier' as AuthRole };
      return {
        user: safeCourier,
        access_token: this.jwtService.sign(payload),
      };
    }

    throw new UnauthorizedException('Invalid credentials');
  }
}
