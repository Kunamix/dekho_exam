import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";

export class TokenAndHashGenerator {
  signToken(
    payload: string | object | Buffer,
    secret: string,
    options?: SignOptions
  ): string {
    return jwt.sign(payload, secret, options);
  }

  verifyToken<T = JwtPayload>(
    token: string,
    secret: string
  ): T {
    return jwt.verify(token, secret) as T;
  }

  async signHash(data: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(data, salt);
  }

  async verifyHash(
    data: string,
    hashData: string
  ): Promise<boolean> {
    return bcrypt.compare(data, hashData);
  }
}

export const authHelper = new TokenAndHashGenerator();
