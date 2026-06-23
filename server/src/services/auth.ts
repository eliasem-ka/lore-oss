import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export type AuthUser = { id: string; email: string; name: string; role: string };

let warned = false;
function secret(): string {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }
  if (!warned) {
    console.warn("[auth] JWT_SECRET not set — using insecure dev secret");
    warned = true;
  }
  return "dev-secret";
}
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function issueToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    secret(),
    { expiresIn: EXPIRES_IN } as jwt.SignOptions
  );
}

export function verifyToken(token: string): AuthUser {
  const p = jwt.verify(token, secret(), { algorithms: ["HS256"] }) as jwt.JwtPayload;
  return {
    id: String(p.sub),
    email: String(p.email),
    name: String(p.name),
    role: String(p.role),
  };
}
