import argon2Id from "argon2";
export const hashPassword = (password: string): Promise<string> => {
  return argon2Id.hash(password, {
    type: argon2Id.argon2d,
    hashLength: 64,
  });
};
export const verifyPassword = (password: string, hash: string): Promise<boolean> => {
  return argon2Id.verify(password, hash);
};
