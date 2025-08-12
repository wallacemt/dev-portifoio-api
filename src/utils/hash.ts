import argon2Id from 'argon2';
/**
 * Hashes a given password using the Argon2 algorithm.
 * This function is asynchronous and returns a promise
 * that resolves to the hashed password.
 *
 * @param password - The plaintext password to hash.
 * @returns A promise that resolves to the hashed password as a string.
 */

export const hashPassword = (password: string): Promise<string> => {
  return argon2Id.hash(password, {
    type: argon2Id.argon2d,
    hashLength: 64,
  });
};

/**
 * Verifies a given password against a hash. This is an asynchronous function as
 * it takes time to verify the hash.
 *
 * @param password - The password to verify.
 * @param hash - The hash to verify the password against.
 *
 * @returns a boolean indicating whether the password was valid.
 */
export const verifyPassword = (
  password: string,
  hash: string
): Promise<boolean> => {
  return argon2Id.verify(password, hash);
};
