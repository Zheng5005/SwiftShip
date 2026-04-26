import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Courier } from './courier.entity';

export enum OrderStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.orders, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Courier, (courier) => courier.orders, {
    eager: true,
    nullable: true,
  })
  @JoinColumn({ name: 'courier_id' })
  courier: Courier | null;

  @Column({ name: 'pickup_address' })
  pickupAddress: string;

  @Column({ name: 'dropoff_address' })
  dropoffAddress: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
