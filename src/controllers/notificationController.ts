import { Request, Response } from "express";
import {
    createNotificationSchema,
    updateNotificationSchema,
    listNotificationsQuerySchema,
} from "../schemas/notificationSchemas";
import { NotificationService } from "../services/notificationService";

type AuthContext = {
    authenticatedUser: any;
    organizationId: string;
};

function extractAuthContext(request: any): AuthContext | null {
    const authenticatedUser =
        request.user || request.auth || request.session?.user;

    if (!authenticatedUser) {
        return null;
    }

    const organizationId =
        authenticatedUser.organizationId ||
        authenticatedUser.organizationid ||
        authenticatedUser.orgId ||
        authenticatedUser.organization?.id ||
        authenticatedUser.organization?.ID;

    if (!organizationId) {
        return null;
    }

    return { authenticatedUser, organizationId };
}

export class NotificationController {
    static async list(request: Request, response: Response) {
        const authContext = extractAuthContext(request);

        if (!authContext) {
            return response
                .status(401)
                .json({ error: "Unauthorized (missing organizationId)" });
        }

        const queryFilters = listNotificationsQuerySchema.parse(request.query);

        const notifications = await NotificationService.list({
            organizationId: authContext.organizationId,
            userId: authContext.authenticatedUser.id,
            type: queryFilters.type,
            status: queryFilters.status,
            unreadOnly: queryFilters.unreadOnly,
        });

        return response.json(notifications);
    }

    static async create(request: Request, response: Response) {
        const authContext = extractAuthContext(request);

        if (!authContext) {
            return response
                .status(401)
                .json({ error: "Unauthorized (missing organizationId)" });
        }

        const createPayload = createNotificationSchema.parse(request.body);

        const createdNotification = await NotificationService.create({
            organizationId: authContext.organizationId,
            creatorUserId: authContext.authenticatedUser.id,
            userId: createPayload.userId ?? null,
            notificationType: createPayload.notificationType,
            title: createPayload.title,
            description: createPayload.description ?? null,
            actionUrl: createPayload.actionUrl ?? null,
        });

        return response.status(201).json(createdNotification);
    }

    static async update(request: Request, response: Response) {
        const authContext = extractAuthContext(request);

        if (!authContext) {
            return response
                .status(401)
                .json({ error: "Unauthorized (missing organizationId)" });
        }

        const updatePayload = updateNotificationSchema.parse(request.body);

        const updatedNotification = await NotificationService.update({
            organizationId: authContext.organizationId,
            id: request.params.id,
            patch: updatePayload,
        });

        return response.json(updatedNotification);
    }

    static async remove(request: Request, response: Response) {
        const authContext = extractAuthContext(request);

        if (!authContext) {
            return response
                .status(401)
                .json({ error: "Unauthorized (missing organizationId)" });
        }

        const deleteResult = await NotificationService.remove({
            organizationId: authContext.organizationId,
            id: request.params.id,
        });

        return response.json(deleteResult);
    }

    static async markAllRead(request: Request, response: Response) {
        const authContext = extractAuthContext(request);

        if (!authContext) {
            return response
                .status(401)
                .json({ error: "Unauthorized (missing organizationId)" });
        }

        const result = await NotificationService.markAllRead({
            organizationId: authContext.organizationId,
            userId: authContext.authenticatedUser.id,
        });

        return response.json(result);
    }
}