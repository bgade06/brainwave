import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const hashToken = (token) => createHash("sha256").update(token).digest("hex");
export const pkceChallenge = (verifier) => createHash("sha256")
  .update(verifier).digest("base64url");

export function tokensEqual(left, right) {
  const a = Buffer.from(left ?? "");
  const b = Buffer.from(right ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createTokenCipher(base64Key) {
  const key = Buffer.from(base64Key ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return {
    encrypt(value) {
      if (!value) return undefined;
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
    },
    decrypt(value) {
      if (!value) return undefined;
      const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    },
  };
}
