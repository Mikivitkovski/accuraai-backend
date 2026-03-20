import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Organization } from "./Organization";

export type UserRole = "admin" | "owner" | "member" | "reviewer";

@Entity({ name: "users" })
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 120 })
  email!: string;

  @Column({ type: "varchar", length: 255, select: false })
  passwordHash!: string;

  @Column({ type: "uuid", nullable: true })
  organizationId?: string;

  @ManyToOne(() => Organization, (o) => o.users, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "organizationId" })
  organization?: Organization;

  @Column({ type: "varchar", length: 80 })
  name!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  avatarPath?: string | null;

  @Column({ type: "varchar", length: 10, default: "member" })
  role!: UserRole;

  @Column({ type: "timestamptz", nullable: true })
  emailVerifiedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: "boolean", default: false })
  mfaEnabled!: boolean;

  @Column({ type: "text", nullable: true, select: false })
  mfaSecret!: string | null;

  @Column({ type: "text", nullable: true, select: false })
  mfaTempSecret!: string | null;

  @Column({ name: "first_login", type: "boolean", default: true })
  firstLogin!: boolean;

  @Column({ type: "varchar", nullable: true, select: false })
  emailVerifyCodeHash!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  emailVerifyCodeExpiresAt!: Date | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  pendingEmail!: string | null;

  @Column({ type: "varchar", nullable: true, select: false })
  emailChangeCodeHash!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  emailChangeCodeExpiresAt!: Date | null;

  @Column({ type: "boolean", default: false })
  notifyByEmail!: boolean;

}
