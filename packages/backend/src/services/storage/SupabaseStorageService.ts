import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import path from 'path';
import { StorageService } from './StorageService.js';

export class SupabaseStorageService implements StorageService {
  private supabase: SupabaseClient;
  private bucket: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    this.bucket = process.env.SUPABASE_BUCKET || 'documents';

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables must be defined');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async upload(buffer: Buffer, originalName: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase();
    const fileKey = `${randomUUID()}${ext}`;

    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(fileKey, buffer, {
        contentType: this.getContentType(ext),
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload to Supabase: ${error.message}`);
    }

    return fileKey;
  }

  async download(fileKey: string): Promise<Buffer> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .download(fileKey);

    if (error) {
      throw new Error(`Failed to download from Supabase: ${error.message}`);
    }

    return Buffer.from(await data.arrayBuffer());
  }

  async delete(fileKey: string): Promise<void> {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .remove([fileKey]);

    if (error) {
      throw new Error(`Failed to delete from Supabase: ${error.message}`);
    }
  }

  private getContentType(ext: string): string {
    switch (ext) {
      case '.pdf':
        return 'application/pdf';
      case '.doc':
        return 'application/msword';
      case '.docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case '.csv':
        return 'text/csv';
      case '.xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      default:
        return 'application/octet-stream';
    }
  }
}
