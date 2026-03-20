import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity({ name: "payments" })
export class Payment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "subscription_id", type: "uuid", nullable: true })
  subscriptionId!: string | null;

  @Column({ type: "text" })
  invoice!: string;

  @Column({
    name: "amount",
    type: "numeric",
    precision: 10,
    scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  amount!: number;

  @Column({ type: "text", default: "USD" })
  currency!: string;

  @Column({ type: "text", default: "paid" })
  status!: "paid" | "pending" | "failed";

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}