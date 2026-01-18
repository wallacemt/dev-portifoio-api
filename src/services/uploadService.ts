import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { Exception } from "../utils/exception";
import { devDebugger } from "../utils/devDebugger";

const EXTRACT_PULIC_ID_REGEX = /\/v\d+\/(.+)\.\w+$/;

const VALIDATE_FILE_REGEX = /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/;
export interface UploadFileOptions {
  folder?: string;
  filename?: string;
  resourceType?: "image" | "raw" | "video" | "auto";
  allowedFormats?: string[];
}

export interface UploadResult {
  url: string;
  publicId: string;
  format: string;
  resourceType: string;
  bytes: number;
}

export class UploadService {
  private readonly DEFAULT_FOLDER = "portifolio";
  private readonly MAX_FILE_SIZE = 10_485_760; // 10MB

  /**
   * Upload a single file (base64 or buffer)
   */
  async uploadFile(file: string | Buffer, options: UploadFileOptions = {}): Promise<UploadResult> {
    try {
      const { folder = this.DEFAULT_FOLDER, filename, resourceType = "auto", allowedFormats } = options;

      let dataUri: string;

      if (Buffer.isBuffer(file)) {
        const base64 = file.toString("base64");
        dataUri = `data:application/octet-stream;base64,${base64}`;
      } else if (file.startsWith("data:")) {
        dataUri = file;
      } else {
        dataUri = `data:application/octet-stream;base64,${file}`;
      }

      const uploadOptions: {
        public_id?: string;
        folder?: string;
        resource_type?: "image" | "video" | "raw" | "auto";
        allowed_formats?: string[];
      } = {
        folder,
        resource_type: resourceType,
      };

      if (filename) {
        uploadOptions.public_id = filename;
      }

      if (allowedFormats && allowedFormats.length > 0) {
        uploadOptions.allowed_formats = allowedFormats;
      }

      const result: UploadApiResponse = await cloudinary.uploader.upload(dataUri, uploadOptions);

      if (result.bytes > this.MAX_FILE_SIZE) {
        await this.deleteFile(result.public_id);
        throw new Exception("Arquivo excede o tamanho máximo permitido (10MB)", 400);
      }

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        resourceType: result.resource_type,
        bytes: result.bytes,
      };
    } catch (error) {
      if (error instanceof Exception) throw error;
      devDebugger("Erro ao enviar arquivo", error, "error");
      throw new Exception("Erro ao fazer upload do arquivo", 500);
    }
  }

  /**
   * Upload multiple files
   */
  async uploadMultipleFiles(files: Array<string | Buffer>, options: UploadFileOptions = {}): Promise<UploadResult[]> {
    try {
      const uploadPromises = files.map((file) => this.uploadFile(file, options));
      return await Promise.all(uploadPromises);
    } catch (error) {
      if (error instanceof Exception) throw error;
      throw new Exception("Erro ao fazer upload dos arquivos", 500);
    }
  }

  /**
   * Delete a file from Cloudinary
   */
  async deleteFile(publicId: string, resourceType: "image" | "raw" | "video" = "image"): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
    } catch (error) {
      throw new Exception(`Erro ao deletar arquivo: ${error}`, 500);
    }
  }

  /**
   * Delete multiple files from Cloudinary
   */
  async deleteMultipleFiles(publicIds: string[], resourceType: "image" | "raw" | "video" = "image"): Promise<void> {
    try {
      await cloudinary.api.delete_resources(publicIds, {
        resource_type: resourceType,
      });
    } catch (error) {
      throw new Exception(`Erro ao deletar arquivos: ${error}`, 500);
    }
  }

  /**
   * Extract public ID from Cloudinary URL
   */
  extractPublicId(url: string): string | null {
    try {
      const match = url.match(EXTRACT_PULIC_ID_REGEX);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Validate file type
   */
  validateFileType(base64: string, allowedTypes: string[]): boolean {
    const dataUriMatch = base64.match(VALIDATE_FILE_REGEX);
    if (!dataUriMatch) return false;

    const mimeType = dataUriMatch[1];
    return allowedTypes.some((type) => mimeType?.includes(type));
  }

  /**
   * Get file size from base64
   */
  getBase64Size(base64: string): number {
    const base64Data = base64.split(",")[1] || base64;
    const padding = (base64Data.match(/=/g) || []).length;
    return (base64Data.length * 3) / 4 - padding;
  }
}
