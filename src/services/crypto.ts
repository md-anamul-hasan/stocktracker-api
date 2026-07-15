import { hash, compare } from 'bcrypt-ts';

export async function hashPassword(password: string): Promise<string> {
  return await hash(password, 10);
}

export async function comparePassword(password: string, hashStr: string): Promise<boolean> {
  return await compare(password, hashStr);
}
