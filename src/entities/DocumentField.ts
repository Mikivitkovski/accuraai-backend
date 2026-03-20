import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    Index,
} from "typeorm";
import { DocumentExtraction } from "./DocumentExtraction";

@Entity({ name: "document_fields" })
export class DocumentField {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Index()
    @Column({ type: "uuid", name: "extraction_id" })
    extractionId!: string;

    @ManyToOne(() => DocumentExtraction, (extraction: DocumentExtraction) => extraction.fields, {
        onDelete: "CASCADE",
    })
    @JoinColumn({ name: "extraction_id" })
    extraction!: DocumentExtraction;

    @Column({ type: "text", name: "field_name" })
    fieldName!: string;

    @Column({ type: "text", nullable: true, name: "extracted_value" })
    extractedValue?: string | null;

    @Column({ type: "text", nullable: true, name: "final_value" })
    finalValue?: string | null;

    @Column({ type: "numeric", precision: 5, scale: 2, nullable: true })
    confidence?: string | null;

    @Column({ type: "text", nullable: true, name: "source_text" })
    sourceText?: string | null;

    @Column({ type: "integer", nullable: true, name: "source_page" })
    sourcePage?: number | null;

    @Column({ type: "jsonb", nullable: true, name: "bbox_json" })
    bboxJson?: Record<string, any> | null;

    @Column({ type: "text", default: "pending" })
    status!: string;

    @Column({ type: "uuid", nullable: true, name: "approved_by" })
    approvedBy?: string | null;

    @Column({ type: "timestamptz", nullable: true, name: "approved_at" })
    approvedAt?: Date | null;

    @Column({ type: "text", nullable: true, name: "value_origin" })
    valueOrigin?: "extracted" | "calculated" | "manual" | null;
}