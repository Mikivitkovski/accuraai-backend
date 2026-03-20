import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

@Entity({ name: "companies" })
@Index("companies_org_lower_name_uq", ["organizationId", "name"], { unique: false })
export class Company {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid", name: "organization_id" })
  organizationId!: string;

  @Index()
  @Column({ type: "text" })
  name!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}