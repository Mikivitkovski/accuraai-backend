import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity({ name: "payment_methods" })
export class PaymentMethod {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ type: "text", default: "visa" })
  brand!: string;

  @Column({ type: "text" })
  last4!: string;

  @Column({ name: "exp_month", type: "int" })
  expMonth!: number;

  @Column({ name: "exp_year", type: "int" })
  expYear!: number;

  @Column({ name: "is_default", type: "bool", default: true })
  isDefault!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}