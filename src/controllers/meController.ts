import { Request, Response } from "express";
import { AppDataSource } from "../db/dataSource";
import { User } from "../entities/User";
import { z } from "zod";

const updateNotifyByEmailSchema = z.object({
    notifyByEmail: z.boolean(),
});

export class MeController {
    static async updateNotifyByEmail(req: Request, res: Response) {
        const authenticatedUser = (req as any).user;

        if (!authenticatedUser?.id) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { notifyByEmail } = updateNotifyByEmailSchema.parse(req.body);

        const userRepository = AppDataSource.getRepository(User);

        const existingUser = await userRepository.findOne({
            where: { id: authenticatedUser.id },
        });

        if (!existingUser) {
            return res.status(404).json({ message: "User not found" });
        }

        existingUser.notifyByEmail = notifyByEmail;

        await userRepository.save(existingUser);

        return res.json({
            ok: true,
            notifyByEmail: existingUser.notifyByEmail,
        });
    }
}