import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { env } from '../env';
import { OwnerRepository } from '../repository/ownerRepository';
import type { OwnerDataRequest, OwnerDataResponse } from '../types/owner';
import { Exception } from '../utils/exception';
import { hashPassword, verifyPassword } from '../utils/hash';
import { ownerSchema } from '../validations/ownerValidations';

const jwtSecret = env.JWT_SECRET;

const MAX_ATTEMPTS = 3;
const LOCK_TIME = 30 * 60 * 1000;

interface AttemptData {
  attempts: number;
  lastAttempt: number;
}

const attemptsCache: Record<string, AttemptData> = {};
export class AuthService {
  private ownerRepository = new OwnerRepository();

  /**
   * Registers a new owner by hashing the provided password and storing the owner data.
   * @param ownerData - The data for the new owner, including the password to hash.
   * @returns The created owner data with a hashed password.
   * @throws Exception if the owner data is not provided.
   */

   async registerOwner(
    ownerData: OwnerDataRequest
  ): Promise<OwnerDataResponse> {
    if (!ownerData) throw new Exception('Owner data e requerido!', 400);
    const owner = await this.ownerRepository.findByEmail(ownerData.email);
    if (owner) throw new Exception('Email ja cadastrado!', 409);

    try {
      ownerSchema.parse(ownerData);
      const hashedPassword = await hashPassword(ownerData.password);
      ownerData.password = hashedPassword;
      return await this.ownerRepository.createOwner(ownerData);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new Exception(e.issues?.[0]?.message || "error for resgister owner", 400);
      }
      throw new Exception(`Informe os dados corretamente: ${e}`, 400);
    }
  }
  /**
   * Authenticates an existing owner by verifying the provided password and returning the owner's data with a JWT token.
   * @param email - The email of the owner to authenticate.
   * @param password - The password to verify.
   * @returns The authenticated owner data with a JWT token.
   * @throws Exception if the owner is not found or if the password is invalid.
   */
   async login(
    email: string,
    password: string
  ): Promise<OwnerDataResponse> {
    const owner = await this.ownerRepository.findByEmail(email);

    if (!owner) throw new Exception('Owner não encontrado!', 404);
    const data = attemptsCache[email] || {
      attempts: 0,
      lastAttempt: Date.now(),
    };
    if (
      data.attempts >= MAX_ATTEMPTS &&
      Date.now() - data.lastAttempt < LOCK_TIME
    ) {
      throw new Exception(
        `Número máximo de tentativas excedido. Tente novamente em ${Math.ceil((LOCK_TIME - Date.now() + data.lastAttempt) / 1000 / 60)} minutos`,
        429
      );
    }

    const isValidPassword = await verifyPassword(owner.password, password);

    if (!isValidPassword) {
      attemptsCache[email] = {
        attempts: data.attempts + 1,
        lastAttempt: Date.now(),
      };

      throw new Exception(
        `Senha inválida, tentativas restantes: ${MAX_ATTEMPTS - data.attempts}`,
        401
      );
    }

    delete attemptsCache[email];
    const token = jwt.sign(
      { id: owner.id, email: owner.email },
      jwtSecret as string,
      { expiresIn: '7d' }
    );

    return { ...owner, token };
  }
}
