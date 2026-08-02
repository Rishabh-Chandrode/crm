import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { StorageService } from './StorageService.js';

export class LocalDiskStorageService implements StorageService {
  private uploadsDir: string;

  constructor() {
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    
    // Ensure the uploads directory exists
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async upload(buffer: Buffer, originalName: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase();
    const fileKey = `${randomUUID()}${ext}`;
    const filePath = path.join(this.uploadsDir, fileKey);

    await fs.promises.writeFile(filePath, buffer);
    
    // Return just the fileKey so it acts similarly to object storage keys
    // You could also return the full path, but keeping it relative to uploadsDir is cleaner
    return fileKey;
  }

  async download(fileKey: string): Promise<Buffer> {
    const filePath = path.join(this.uploadsDir, fileKey);
    
    try {
      const buffer = await fs.promises.readFile(filePath);
      return buffer;
    } catch (err) {
      throw new Error(`Failed to read file from local disk: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async delete(fileKey: string): Promise<void> {
    const filePath = path.join(this.uploadsDir, fileKey);
    
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err) {
      throw new Error(`Failed to delete file from local disk: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
