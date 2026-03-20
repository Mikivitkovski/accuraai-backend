import { Entity, PrimaryColumn, Column, CreateDateColumn } from "typeorm";

@Entity({ name: "plans" })
export class Plan {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({
    name: "price",
    type: "numeric",
    precision: 10,
    scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  price!: number;

  @Column({ type: "text", default: "USD" })
  currency!: string;

  @Column({ type: "text", default: "month" })
  interval!: string;

  @Column({ type: "jsonb", default: {} })
  features!: Record<string, any>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}