import { ZodError } from "zod";
import { OwnerRepository } from "../repository/ownerRepository";
import { OwnerDataOptionalRequest, OwnerDataResponse } from "../types/owner";
import { Exception } from "../utils/exception";
import { ownerSchemaOptional } from "../validations/ownerValidations";

export class OwnerService {
  private ownerRepository = new OwnerRepository();
  public async getOwner(ownerId: string): Promise<OwnerDataResponse> {
    if (!ownerId || ownerId === ":ownerId") throw new Exception("ID de owner invalido", 400);
    const owner = await this.ownerRepository.findById(ownerId);
    if (!owner) throw new Exception("Owner não  Encontrado!", 404);
    return {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      avatar: owner.avatar,
      about: owner.about,
      occupation: owner.occupation,
      birthDate: owner.birthDate,
    };
  }

  public async updateOwner(ownerUpdateData: OwnerDataOptionalRequest, ownerId: string) {
    try {
      ownerSchemaOptional.parse(ownerUpdateData);
      return await this.ownerRepository.updateOwner(ownerUpdateData, ownerId);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues[0].message, 400);
      }
      throw new Exception("Informe os dados corretamente", 400);
    }
  }
}
