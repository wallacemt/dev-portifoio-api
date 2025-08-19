import { cloudinary } from "../config/cloudinary";

export class CloudinaryService {
  async uploadBase64(base64: string, filename?: string, typeData = "image/png"): Promise<string> {
    const dataUri = `data:${typeData};base64,${base64}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "portifolio/project",
      public_id: filename,
    });
    return result.secure_url;
  }
}
