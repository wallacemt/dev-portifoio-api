import { OwnerRepository } from "../repository/ownerRepository";
import { OwnerDataResponse } from "../types/owner";
import { Exception } from "../utils/exception";

export class OwnerService {
  private ownerRepository = new OwnerRepository();
  public async getOwner(id: string): Promise<OwnerDataResponse> {
    const owner = await this.ownerRepository.findByEmailOrId(id);
    if (!owner) throw new Exception("Owner not found", 404);
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
}
