import { AppDataSource } from "../db/dataSource";
import { Notification, NotificationStatus, NotificationType } from "../entities/Notification";
import { User } from "../entities/User";
import { sendNotificationEmail } from "./mailer";

type ListNotificationsParams = {
    organizationId: string;
    userId?: string;
    type?: NotificationType;
    status?: NotificationStatus;
    unreadOnly?: boolean;
};

type CreateNotificationParams = {
    organizationId: string;
    creatorUserId: string;
    userId?: string | null;
    notificationType: NotificationType;
    title: string;
    description?: string | null;
    actionUrl?: string | null;
};

type UpdateNotificationParams = {
    organizationId: string;
    id: string;
    patch: Partial<Pick<
        Notification,
        "status" | "title" | "description" | "actionUrl" | "notificationType"
    >>;
};

type RemoveNotificationParams = { organizationId: string; id: string };

type MarkAllReadParams = { organizationId: string; userId?: string };

export class NotificationService {
    private static get notificationRepository() {
        return AppDataSource.getRepository(Notification);
    }

    private static get userRepository() {
        return AppDataSource.getRepository(User);
    }

    static async list(params: ListNotificationsParams) {
        const notificationQuery = this.notificationRepository
            .createQueryBuilder("notification")
            .where("notification.organizationId = :organizationId", {
                organizationId: params.organizationId,
            })
            .orderBy("notification.createdAt", "DESC");

        if (params.userId) {
            notificationQuery.andWhere(
                "(notification.userId IS NULL OR notification.userId = :userId)",
                { userId: params.userId }
            );
        }

        if (params.type) {
            notificationQuery.andWhere("notification.notificationType = :type", {
                type: params.type,
            });
        }

        if (params.status) {
            notificationQuery.andWhere("notification.status = :status", {
                status: params.status,
            });
        }

        if (params.unreadOnly) {
            notificationQuery.andWhere("notification.status = :unreadStatus", {
                unreadStatus: "Unread",
            });
        }

        return notificationQuery.getMany();
    }

    static async create(params: CreateNotificationParams) {
        const notificationToCreate = this.notificationRepository.create({
            organizationId: params.organizationId,
            userId: params.userId ?? null,
            notificationType: params.notificationType,
            title: params.title,
            description: params.description ?? null,
            actionUrl: params.actionUrl ?? null,
            status: "Unread",
            emailSent: false,
        });

        const createdNotification = await this.notificationRepository.save(notificationToCreate);

        const targetUserIdForEmail = params.userId ?? params.creatorUserId;

        const recipientUser = await this.userRepository.findOne({
            where: { id: targetUserIdForEmail },
        });

        const shouldSendEmail = Boolean(recipientUser?.notifyByEmail && recipientUser?.email);

        if (shouldSendEmail) {
            await sendNotificationEmail({
                to: recipientUser!.email,
                subject: `[Accuraai] ${createdNotification.notificationType} notification`,
                title: createdNotification.title,
                description: createdNotification.description ?? null,
                actionUrl: createdNotification.actionUrl ?? null,
            });

            createdNotification.emailSent = true;
            await this.notificationRepository.save(createdNotification);
        }

        return createdNotification;
    }

    static async update(params: UpdateNotificationParams) {
        const existingNotification = await this.notificationRepository.findOne({
            where: { id: params.id, organizationId: params.organizationId },
        });

        if (!existingNotification) {
            throw new Error("NOT_FOUND");
        }

        Object.assign(existingNotification, params.patch);

        return this.notificationRepository.save(existingNotification);
    }

    static async remove(params: RemoveNotificationParams) {
        const existingNotification = await this.notificationRepository.findOne({
            where: { id: params.id, organizationId: params.organizationId },
        });

        if (!existingNotification) {
            throw new Error("NOT_FOUND");
        }

        await this.notificationRepository.remove(existingNotification);

        return { ok: true };
    }

    static async markAllRead(params: MarkAllReadParams) {
        const bulkUpdateQuery = this.notificationRepository
            .createQueryBuilder()
            .update(Notification)
            .set({ status: "Read" })
            .where("organizationId = :organizationId", { organizationId: params.organizationId })
            .andWhere("status = :unreadStatus", { unreadStatus: "Unread" });

        if (params.userId) {
            bulkUpdateQuery.andWhere("(userId IS NULL OR userId = :userId)", {
                userId: params.userId,
            });
        }

        await bulkUpdateQuery.execute();

        return { ok: true };
    }
}