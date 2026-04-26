import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { config } from 'dotenv';
import { User, Courier, Order } from '../entities';

config();

export const typeORMConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'swiftship',
  password: process.env.DB_PASSWORD || 'swiftship_secret',
  database: process.env.DB_DATABASE || 'swiftship',
  entities: [User, Courier, Order],
  migrations: [__dirname + '/../migrations/*.{js,ts}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};
