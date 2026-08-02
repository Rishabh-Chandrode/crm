import { StorageService } from './StorageService.js';
import { SupabaseStorageService } from './SupabaseStorageService.js';
import { LocalDiskStorageService } from './LocalDiskStorageService.js';

let storageServiceInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!storageServiceInstance) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (supabaseUrl && supabaseKey) {
      console.log('Using SupabaseStorageService for document storage.');
      storageServiceInstance = new SupabaseStorageService();
    } else {
      console.warn('SUPABASE_URL or SUPABASE_KEY is missing. Falling back to LocalDiskStorageService.');
      storageServiceInstance = new LocalDiskStorageService();
    }
  }
  
  return storageServiceInstance;
}
