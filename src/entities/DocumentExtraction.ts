import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from "typeorm";
import { FileEntity } from "./File";
import { DocumentField } from "./DocumentField";

@Entity({ name: "document_extractions" })
export class DocumentExtraction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "uuid", name: "document_id" })
  documentId!: string;

  @ManyToOne(() => FileEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "document_id" })
  document!: FileEntity;

  @Column({ type: "text", nullable: true, name: "raw_text" })
  rawText?: string | null;

  @Column({ type: "text", nullable: true, name: "ocr_provider" })
  ocrProvider?: string | null;

  @Column({ type: "text", nullable: true, name: "ai_provider" })
  aiProvider?: string | null;

  @Column({ type: "text", default: "completed", name: "scan_status" })
  scanStatus!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @OneToMany(() => DocumentField, (field: DocumentField) => field.extraction)
  fields?: DocumentField[];
}