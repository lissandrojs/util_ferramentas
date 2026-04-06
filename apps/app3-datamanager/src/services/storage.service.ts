import { createReadStream, createWriteStream, mkdirSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './utils/logger';

export interface StoredFile {
  storedName: string;
  storagePath: string;
  publicUrl: string;
  storageType: 'local' | 's3';
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  path?: string;
}

// ── Storage Strategy Interface ──────────────────────────────────
interface StorageStrategy {
  save(file: UploadedFile, folder: string): Promise<StoredFile>;
  delete(storagePath: string): Promise<void>;
  getUrl(storagePath: string): string;
}

// ─────────────────────────────────────────────────────────────────
// LOCAL STORAGE
// ─────────────────────────────────────────────────────────────────
class LocalStorage implements StorageStrategy {
  private uploadDir: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async save(file: UploadedFile, folder: string): Promise<StoredFile> {
    const ext = path.extname(file.originalname);
    const storedName = `${uuidv4()}${ext}`;
    const folderPath = path.join(this.uploadDir, folder);

    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
    }

    const fullPath = path.join(folderPath, storedName);
    const storagePath = path.join(folder, storedName);

    if (file.buffer) {
      const { writeFileSync } = require('fs');
      writeFileSync(fullPath, file.buffer);
    } else if (file.path) {
      // multer disk storage — file already saved
      const { renameSync } = require('fs');
      renameSync(file.path, fullPath);
    }

    return {
      storedName,
      storagePath,
      publicUrl: `/api/files/download/${storagePath.replace(/\\/g, '/')}`,
      storageType: 'local',
    };
  }

  async delete(storagePath: string): Promise<void> {
    const fullPath = path.join(this.uploadDir, storagePath);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }

  getUrl(storagePath: string): string {
    return `/api/files/download/${storagePath.replace(/\\/g, '/')}`;
  }

  getFullPath(storagePath: string): string {
    return path.join(this.uploadDir, storagePath);
  }
}

// ─────────────────────────────────────────────────────────────────
// S3 STORAGE (stub — ready to implement)
// Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME
// ─────────────────────────────────────────────────────────────────
class S3Storage implements StorageStrategy {
  async save(file: UploadedFile, folder: string): Promise<StoredFile> {
    // TODO: implement with @aws-sdk/client-s3
    // const s3 = new S3Client({ region: process.env.AWS_REGION });
    // const key = `${folder}/${uuidv4()}${ext}`;
    // await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: file.buffer }));
    throw new Error('S3 storage not yet configured. Set AWS credentials.');
  }

  async delete(storagePath: string): Promise<void> {
    // TODO: s3.send(new DeleteObjectCommand({ Bucket, Key: storagePath }));
    logger.warn('S3 delete not implemented: ' + storagePath);
  }

  getUrl(storagePath: string): string {
    return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${storagePath}`;
  }
}

// ── Factory ────────────────────────────────────────────────────
function createStorage(): StorageStrategy {
  const type = process.env.STORAGE_TYPE || 'local';
  if (type === 's3') return new S3Storage();
  return new LocalStorage();
}

export const storage = createStorage();
export const localStorage = storage as LocalStorage;
