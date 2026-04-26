import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { existsSync } from 'fs';

// Load .env.local if it exists (for local CLI commands), otherwise .env
const envFile = existsSync('.env.local') ? '.env.local' : '.env';
config({ path: envFile });

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'swiftship',
  password: process.env.DB_PASSWORD || 'swiftship_secret',
  database: process.env.DB_DATABASE || 'swiftship',
  entities: [__dirname + '/../**/*.entity.{js,ts}'],
  migrations: [__dirname + '/../migrations/*.{js,ts}'],
  synchronize: false,
});
