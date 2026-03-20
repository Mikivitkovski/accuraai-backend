import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from "typeorm";

export type NotificationType =
    | "Deadline"
    | "Billing"
    | "Security"
    | "Warning"
    | "Reminder";

export type NotificationStatus = "Unread" | "Read" | "Completed" | "Dismissed";

@Entity("notifications")
export class Notification {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Index()
    @Column({ name: "organizationid", type: "uuid" })
    organizationId!: string;

    @Index()
    @Column({ name: "userid", type: "uuid", nullable: true })
    userId!: string | null;

    @Column({ name: "notificationtype", type: "text" })
    notificationType!: NotificationType;

    @Column({ type: "text", default: "Unread" })
    status!: NotificationStatus;

    @Column({ type: "varchar", length: 255 })
    title!: string;

    @Column({ type: "text", nullable: true })
    description?: string | null;

    @Column({ name: "actionurl", type: "varchar", length: 500, nullable: true })
    actionUrl?: string | null;

    @Column({ name: "emailsent", type: "boolean", default: false })
    emailSent!: boolean;

    @CreateDateColumn({ name: "createdat", type: "timestamptz" })
    createdAt!: Date;

    @UpdateDateColumn({ name: "updatedat", type: "timestamptz" })
    updatedAt!: Date;
}