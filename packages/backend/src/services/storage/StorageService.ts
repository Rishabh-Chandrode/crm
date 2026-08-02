export interface StorageService {
  /**
   * Uploads a file buffer to the storage service and returns the file key/path.
   * @param buffer The file content to upload
   * @param originalName The original filename, useful for extracting extensions
   * @returns The generated file key or path
   */
  upload(buffer: Buffer, originalName: string): Promise<string>;

  /**
   * Downloads a file from the storage service and returns its content as a buffer.
   * @param fileKey The key or path of the file to download
   * @returns The file content as a buffer
   */
  download(fileKey: string): Promise<Buffer>;

  /**
   * Deletes a file from the storage service.
   * @param fileKey The key or path of the file to delete
   */
  delete(fileKey: string): Promise<void>;
}
