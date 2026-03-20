import {
  Entity, PrimaryGeneratedColumn, Column, OneToMany,
  CreateDateColumn, UpdateDateColumn
} from "typeorm";
import { User } from "./User";
import { FileEntity } from "./File";

@Entity("organizations")
export class Organization {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120, unique: true })
  name!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  description?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  logoPath?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  legalName?: string | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  country?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  website!: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  contactName?: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  contactPosition?: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  contactEmail?: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  contactPhone?: string | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  taxId?: string | null;

  @Column({ type: "date", nullable: true })
  registrationDate?: string | null;

  @OneToMany(() => User, (u) => u.organization)
  users!: User[];

  @OneToMany(() => FileEntity, (f) => f.organization)
  files!: FileEntity[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ default: false })
  requireMfa!: boolean;
}
