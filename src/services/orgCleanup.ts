import { AppDataSource } from "../db/dataSource";
import { User } from "../entities/User";
import { Organization } from "../entities/Organization";
import { purgeOrgStorage } from "../services/s3";

const userRepo = () => AppDataSource.getRepository(User);
const orgRepo = () => AppDataSource.getRepository(Organization);

export async function deleteOrgIfEmpty(orgId?: string | null) {
  if (!orgId) return;

  const count = await userRepo().count({ where: { organizationId: orgId } });
  if (count > 0) return; 

  try {
    const out = await purgeOrgStorage(orgId);
    console.log("[orgCleanup] S3 purged:", out);
  } catch (e) {
    console.error("[orgCleanup] S3 purge failed:", e);
  }

  await orgRepo().delete({ id: orgId });
  console.log("[orgCleanup] Organization deleted:", orgId);
}
