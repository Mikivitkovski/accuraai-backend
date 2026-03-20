import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import type {
  _Object as S3Object,
  ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import type { Readable } from "stream";
import unzipper from "unzipper";
import { lookup as lookupMime } from "mime-types";
import { env } from "../config/env";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let s3Client: S3Client | null = null;

function coerceBoolean(v: unknown) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["1", "true", "yes", "on"].includes(v.toLowerCase());
  return false;
}

function getRegion(): string {
  return process.env.S3_REGION || env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-north-1";
}

function getAccessKeyId() {
  return process.env.S3_ACCESS_KEY_ID ?? env.AWS_ACCESS_KEY_ID;
}
function getSecretAccessKey() {
  return process.env.S3_SECRET_ACCESS_KEY ?? env.AWS_SECRET_ACCESS_KEY;
}
function getEndpoint() {
  return process.env.S3_ENDPOINT || undefined;
}
function getForcePathStyle() {
  return coerceBoolean(process.env.S3_FORCE_PATH_STYLE);
}


export function sanitizeCompanyFolder(name: string) {
  const raw = String(name || "").trim();
  if (!raw) throw new Error("Company name is required");

  const cleaned = raw
    .replace(/[\/\\]+/g, " ")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) throw new Error("Company name is invalid");
  return cleaned;
}

export function sanitizeIdFolder(id: string) {
  const raw = String(id || "").trim();
  if (!raw) throw new Error("Id is required");

  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, "");
  if (!cleaned) throw new Error("Id is invalid");
  return cleaned;
}

function s3() {
  if (s3Client) return s3Client;

  const region = getRegion();
  if (!region) throw new Error("AWS region is missing. Set AWS_REGION or S3_REGION in your .env");

  const base: {
    region: string;
    credentials?: { accessKeyId: string; secretAccessKey: string };
  } = { region };

  const accessKeyId = getAccessKeyId();
  const secretAccessKey = getSecretAccessKey();
  if (accessKeyId && secretAccessKey) base.credentials = { accessKeyId, secretAccessKey };

  const endpoint = getEndpoint();
  if (!endpoint) {
    s3Client = new S3Client(base);
  } else {
    s3Client = new S3Client({
      ...base,
      endpoint,
      forcePathStyle: getForcePathStyle(),
    });
  }

  return s3Client;
}

export { s3Client };

export function orgStandardBasePrefix(orgId: string) {
  return `${env.S3_BASE_PREFIX ?? "Accuraai/"}${orgId}/`;
}

function orgUploadedDocsBase(orgId: string) {
  return `${orgStandardBasePrefix(orgId)}uploaded documents/`;
}

function orgUploadedDocsBaseNoSpace(orgId: string) {
  return `${orgStandardBasePrefix(orgId)}uploaded-documents/`;
}

function orgExtractedDocsBase(orgId: string) {
  return `${orgStandardBasePrefix(orgId)}extracted documents/`;
}

function orgUploadedDocsCompanyPrefix(orgId: string, companyName: string) {
  const base = orgUploadedDocsBase(orgId);
  const company = sanitizeCompanyFolder(companyName);
  return `${base}${company}/`;
}


function orgUploadedDocsCompanyIdPrefixInUploadedDocuments(orgId: string, companyId: string) {
  const base = orgUploadedDocsBase(orgId);
  const cid = sanitizeIdFolder(companyId);
  return `${base}${cid}/`;
}

export async function uploadOrgCompanyFileByIdInUploadedDocuments(
  orgId: string,
  companyId: string,
  filename: string,
  body: Buffer | Uint8Array | Readable,
  contentType?: string
) {
  const client = s3();

  const basePrefix = orgUploadedDocsCompanyIdPrefixInUploadedDocuments(orgId, companyId);

  const sanitizedFilename = filename.replace(/[/\\]+/g, "_");
  const key = `${basePrefix}${Date.now()}-${sanitizedFilename}`;

  const put = await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "no-cache, no-store, must-revalidate",
    })
  );

  return { bucket: env.S3_BUCKET, key, etag: put.ETag ?? undefined };
}

function orgUploadedDocsCompanyIdPrefix(orgId: string, companyId: string) {
  const base = orgUploadedDocsBaseNoSpace(orgId);
  const cid = sanitizeIdFolder(companyId);
  return `${base}${cid}/`;
}


export async function getSignedGetObjectUrl(
  key: string,
  opts?: { inline?: boolean; filename?: string; contentType?: string; expiresIn?: number }
) {
  const client = s3();
  const cmd = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ResponseContentDisposition: `${opts?.inline ? "inline" : "attachment"}${opts?.filename ? `; filename="${opts.filename.replace(/"/g, "")}"` : ""
      }`,
    ResponseContentType: opts?.contentType,
  });

  const url = await getSignedUrl(client, cmd, { expiresIn: opts?.expiresIn ?? 300 });
  return url;
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const client = s3();

  const result = await client.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    })
  );

  if (!result.Body) {
    throw new Error("S3 object body is empty");
  }

  const chunks: Buffer[] = [];

  for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function listObjectsUnderPrefix(bucket: string, prefix: string) {
  const client = s3Client ?? s3();

  const results: S3Object[] = [];
  let token: string | undefined;

  do {
    const page: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );

    if (page.Contents?.length) results.push(...page.Contents);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return results;
}

export async function initOrgStorage(orgId: string) {
  const client = s3();
  const region = getRegion();

  try {
    const sts = new STSClient({ region });
    const me = await sts.send(new GetCallerIdentityCommand({}));
    console.log("AWS Identity:", {
      Account: me.Account,
      Arn: me.Arn,
      UserId: me.UserId,
      Region: region,
    });
  } catch (e) {
    console.warn("GetCallerIdentity failed:", e);
  }

  try {
    await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch (e) {
    console.error("HeadBucket failed", e);
    throw new Error(e instanceof Error ? e.message : "Access to bucket denied (need s3:ListBucket).");
  }

  const stdBase = orgStandardBasePrefix(orgId);
  const stdKeys = [
    stdBase,
    `${stdBase}uploaded documents/`,
    `${stdBase}extracted documents/`,
  ];

  try {
    await Promise.all(
      stdKeys.map((Key) =>
        client.send(
          new PutObjectCommand({
            Bucket: env.S3_BUCKET,
            Key,
            Body: "",
          })
        )
      )
    );
  } catch (e) {
    console.error("PutObject failed", e);
    throw new Error(
      e instanceof Error ? e.message : "Writing objects denied (need s3:PutObject on bucket/*)."
    );
  }

  return {
    standard: { bucket: env.S3_BUCKET, prefix: stdBase, created: stdKeys },
  };
}

export async function purgeOrgStorage(orgId: string) {
  const client = s3();
  const bucket = env.S3_BUCKET;
  const prefix = `${env.S3_BASE_PREFIX ?? "accuraai/"}${orgId}/`;

  let deleted = 0;
  let token: string | undefined;

  try {
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: token,
        })
      );

      const batch =
        (page.Contents ?? []).filter((obj) => obj.Key).map((obj) => ({ Key: obj.Key! })) ?? [];

      if (batch.length) {
        const resp = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch, Quiet: true },
          })
        );
        deleted += resp.Deleted?.length ?? 0;
      }

      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  } catch (e) {
    console.error("Purge (list/delete) failed", e);
    throw new Error(e instanceof Error ? e.message : "Failed to purge organization storage from S3.");
  }

  return { bucket, prefix, deleted };
}

export async function uploadOrgCompanyFile(
  orgId: string,
  companyName: string,
  filename: string,
  body: Buffer | Uint8Array | Readable,
  contentType?: string
) {
  const client = s3();

  const basePrefix = orgUploadedDocsCompanyPrefix(orgId, companyName);

  const sanitizedFilename = filename.replace(/[/\\]+/g, "_");
  const key = `${basePrefix}${Date.now()}-${sanitizedFilename}`;

  const put = await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "no-cache, no-store, must-revalidate",
    })
  );

  return { bucket: env.S3_BUCKET, key, etag: put.ETag ?? undefined };
}

export async function uploadOrgCompanyFileById(
  orgId: string,
  companyId: string,
  filename: string,
  body: Buffer | Uint8Array | Readable,
  contentType?: string
) {
  const client = s3();

  const basePrefix = orgUploadedDocsCompanyIdPrefix(orgId, companyId);

  const sanitizedFilename = filename.replace(/[/\\]+/g, "_");
  const key = `${basePrefix}${Date.now()}-${sanitizedFilename}`;

  const put = await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "no-cache, no-store, must-revalidate",
    })
  );

  return { bucket: env.S3_BUCKET, key, etag: put.ETag ?? undefined };
}

export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  contentType?: string
) {
  const client = s3();

  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "no-cache, no-store, must-revalidate",
    })
  );

  return { key };
}

export async function overwriteAtKey(key: string, body: Buffer | Uint8Array, contentType?: string) {
  const client = s3();
  const uploadResponse = await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "no-cache, no-store, must-revalidate",
    })
  );
  return { bucket: env.S3_BUCKET, key, etag: uploadResponse.ETag ?? undefined };
}

export async function deleteKeyFromBucket(bucket: string, key: string) {
  const client = s3();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function deleteKey(key: string) {
  const client = s3();
  await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

export function buildOrgUploadKey(orgId: string, filename: string) {
  const base = `${env.S3_BASE_PREFIX ?? "accuraai/"}${orgId}/uploaded documents/`;
  const clean = filename.replace(/[/\\]+/g, "_");
  return `${base}${Date.now()}-${clean}`;
}


export function buildOrgCompanyUploadKey(orgId: string, companyName: string, filename: string) {
  const base = orgUploadedDocsCompanyPrefix(orgId, companyName);
  const clean = filename.replace(/[/\\]+/g, "_");
  return `${base}${Date.now()}-${clean}`;
}

export function buildOrgCompanyUploadKeyById(orgId: string, companyId: string, filename: string) {
  const base = orgUploadedDocsCompanyIdPrefix(orgId, companyId);
  const clean = filename.replace(/[/\\]+/g, "_");
  return `${base}${Date.now()}-${clean}`;
}

export function buildSiblingKey(oldKey: string, filename: string) {
  const slash = oldKey.lastIndexOf("/");
  const dir = slash >= 0 ? oldKey.slice(0, slash + 1) : "";
  const clean = filename.replace(/[/\\]+/g, "_");
  return `${dir}${Date.now()}-${clean}`;
}

export function extractedBaseForOrg(orgId: string) {
  return orgExtractedDocsBase(orgId);
}

export async function uploadExtractedFile(
  orgId: string,
  companyName: string,
  filename: string,
  body: Buffer | Uint8Array | Readable,
  contentType?: string
) {
  const client = s3();
  const company = sanitizeCompanyFolder(companyName);
  const base = `${orgExtractedDocsBase(orgId)}${company}/`;

  const cleanName = filename.replace(/[/\\]+/g, "_");
  const key = `${base}${Date.now()}-${cleanName}`;

  const put = await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "no-cache, no-store, must-revalidate",
    })
  );

  return { bucket: env.S3_BUCKET, key, etag: put.ETag ?? undefined };
}

function sanitizeZipPath(p: string) {
  let clean = p.replace(/\\/g, "/");
  clean = clean.replace(/(\.\.\/)+/g, "").replace(/^\/+/, "");
  clean = clean.replace(/\/+/g, "/");
  return clean;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (c) => chunks.push(Buffer.from(c)));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return Buffer.concat(chunks);
}

export async function extractZipToFolder(
  orgId: string,
  folderKey: string,
  zip: Buffer | Uint8Array | Readable
) {
  if (!orgId) throw new Error("orgId is required");
  if (!folderKey.endsWith("/")) throw new Error("folderKey must end with '/'");

  const client = s3();

  const stdBucket = env.S3_BUCKET;
  if (!stdBucket) throw new Error("S3_BUCKET env var is missing");

  const toBuffer = async (): Promise<Buffer> => {
    if (Buffer.isBuffer(zip)) return zip;
    if (zip instanceof Uint8Array) return Buffer.from(zip);

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      (zip as Readable)
        .on("data", (c) => chunks.push(Buffer.from(c)))
        .on("error", reject)
        .on("end", resolve);
    });
    return Buffer.concat(chunks);
  };

  const buf = await toBuffer();
  if (!buf.length) throw new Error("ZIP buffer is empty");

  let directory: unzipper.CentralDirectory;
  try {
    directory = await unzipper.Open.buffer(buf);
  } catch (e) {
    throw new Error(`Failed to read ZIP: ${e instanceof Error ? e.message : String(e)}`);
  }

  for (const entry of directory.files) {
    if (entry.type === "Directory") continue;

    const rawPath = entry.path || "";
    const relPath = sanitizeZipPath(rawPath);
    if (!relPath || relPath.endsWith("/")) continue;

    const stdKey = `${folderKey}${relPath}`;
    const mime = lookupMime(relPath) || "application/octet-stream";

    const stream = entry.stream();
    const fileChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c) => fileChunks.push(Buffer.from(c)));
      stream.on("error", reject);
      stream.on("end", resolve);
    });

    const body = Buffer.concat(fileChunks);

    await client.send(
      new PutObjectCommand({
        Bucket: stdBucket,
        Key: stdKey,
        Body: body,
        ContentType: mime,
        CacheControl: "no-cache, no-store, must-revalidate",
      })
    );
  }

  return { stdBucket, folderKey };
}

async function deleteAllUnderPrefix(bucket: string, prefix: string) {
  const client = s3();
  let deleted = 0;
  let token: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );

    const batch = (page.Contents ?? []).filter((o) => o.Key).map((o) => ({ Key: o.Key! })) ?? [];

    if (batch.length) {
      const resp = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch, Quiet: true },
        })
      );
      deleted += resp.Deleted?.length ?? 0;
    }

    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: prefix }));
    deleted += 1;
  } catch { }

  return deleted;
}

export async function uploadUserAvatar(
  userId: string,
  filename: string,
  buffer: Buffer | Uint8Array,
  contentType?: string
) {
  const client = s3();
  const bucket = env.S3_BUCKET!;
  const ext = (filename.split(".").pop() || "png").toLowerCase();
  const key = `${env.S3_BASE_PREFIX ?? "accuraai/"}users/${userId}/avatar.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || lookupMime(filename) || "application/octet-stream",
      CacheControl: "no-cache, no-store, must-revalidate",
    })
  );

  return { bucket, key };
}

export async function getUserAvatarUrl(avatarPath: string, expiresInSeconds = 300) {
  return getSignedGetObjectUrl(avatarPath, {
    inline: true,
    filename: avatarPath.split("/").pop() || "avatar",
    contentType: undefined,
    expiresIn: expiresInSeconds,
  });
}

export async function uploadOrgLogo(
  orgId: string,
  filename: string,
  buffer: Buffer | Uint8Array,
  contentType?: string
) {
  const client = s3();
  const bucket = env.S3_BUCKET!;
  const ext = (filename.split(".").pop() || "png").toLowerCase();
  const key = `${env.S3_BASE_PREFIX ?? "accuraai/"}${orgId}/org-logo.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || lookupMime(filename) || "application/octet-stream",
      CacheControl: "no-cache, no-store, must-revalidate",
    })
  );

  return { bucket, key };
}

export async function getOrgLogoUrl(logoPath: string, expiresInSeconds = 300) {
  return getSignedGetObjectUrl(logoPath, {
    inline: true,
    filename: logoPath.split("/").pop() || "org-logo",
    contentType: undefined,
    expiresIn: expiresInSeconds,
  });
}

export async function deleteUserStorage(userId: string) {
  const bucket = env.S3_BUCKET!;
  const prefix = `${env.S3_BASE_PREFIX ?? "accuraai/"}users/${userId}/`;
  const deleted = await deleteAllUnderPrefix(bucket, prefix);
  return { bucket, prefix, deleted };
}