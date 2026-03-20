import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { Organization } from "./Organization";
import { Company } from "./Company";

@Entity({ name: "files" })
export class FileEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  filename!: string;

  @Column({ type: "varchar" })
  path!: string;

  @Column({ type: "varchar", nullable: true })
  mimeType?: string | null;

  @Column({ type: "bigint", default: 0 })
  sizeBytes!: string;

  @Column({ type: "varchar", nullable: true })
  fileRole?: string | null;

  @Index()
  @Column({ type: "uuid", nullable: true, name: "organization_id" })
  organizationId?: string | null;

  @ManyToOne(() => Organization, (o) => o.files, {
    nullable: true,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id" })
  organization?: Organization | null;

  @Index()
  @Column({ type: "uuid", nullable: true, name: "company_id" })
  companyId?: string | null;

  @ManyToOne(() => Company, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "company_id" })
  company?: Company | null;

  @Index()
  @Column({ type: "uuid", nullable: true, name: "uploaded_by" })
  uploadedBy?: string | null;

  @Column({ type: "text", default: "uploaded" })
  status!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
  
}