import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "subscriptions" })
export class Subscription {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "plan_id", type: "text" })
  planId!: string;

  @Column({ type: "bool", default: false })
  active!: boolean;

  @Column({ type: "text", default: "inactive" })
  status!: "inactive" | "active" | "canceled";

  @Column({ name: "current_period_start", type: "timestamptz", nullable: true })
  currentPeriodStart!: Date | null;

  @Column({ name: "current_period_end", type: "timestamptz", nullable: true })
  currentPeriodEnd!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}