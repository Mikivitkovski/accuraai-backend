import { z } from "zod";

export const NotificationTypeEnum = z.enum([
    "Deadline",
    "Billing",
    "Security",
    "Warning",
    "Reminder",
]);

export const NotificationStatusEnum = z.enum([
    "Unread",
    "Read",
    "Completed",
    "Dismissed",
]);

export const createNotificationSchema = z.object({
    userId: z.string().uuid().nullable().optional(),
    notificationType: NotificationTypeEnum,
    title: z.string().min(2).max(255),
    description: z.string().max(5000).nullable().optional(),
    actionUrl: z.string().url().max(500).nullable().optional(),
});

export const updateNotificationSchema = z.object({
    status: NotificationStatusEnum.optional(),
    title: z.string().min(2).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    actionUrl: z.string().url().max(500).nullable().optional(),
    notificationType: NotificationTypeEnum.optional(),
});

export const listNotificationsQuerySchema = z.object({
    type: NotificationTypeEnum.optional(),
    status: NotificationStatusEnum.optional(),
    unreadOnly: z
        .string()
        .optional()
        .transform((v) => v === "true"),
});