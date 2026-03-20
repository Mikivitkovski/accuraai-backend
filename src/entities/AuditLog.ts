import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index
} from "typeorm";

export type AuditSeverity = "info" | "warning" | "error";

@Entity({ name: "audit_logs" })
@Index(["orgId", "createdAt"])
export class AuditLog {
    @PrimaryGeneratedColumn("increment")
    id!: number;

    @Column({ name: "org_id", type: "uuid" })
    orgId!: string;

    @Column({ name: "actor_user_id", type: "uuid", nullable: true })
    actorUserId!: string | null;

    @Column({ type: "text" })
    action!: string;

    @Column({ type: "text", default: "Organization" })
    category!: string;

    @Column({ type: "text", default: "info" })
    severity!: AuditSeverity;

    @Column({ type: "text" })
    description!: string;

    @Column({ type: "jsonb", nullable: true })
    details!: Record<string, unknown> | null;

    @Column({ type: "inet", nullable: true })
    ip!: string | null;

    @Column({ name: "user_agent", type: "text", nullable: true })
    userAgent!: string | null;

    @CreateDateColumn({ name: "created_at", type: "timestamptz" })
    createdAt!: Date;
}
