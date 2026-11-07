import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from '../storage/db';
import { demand, Fault, type User } from '../core/domain';
const derive = promisify(scrypt);
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export async function passwordHash(password: string) {
 const salt = randomBytes(16).toString('hex');
 const key = await derive(password,salt,64) as Buffer;
 return `${salt}:${key.toString('hex')}`;
}
export async function passwordMatches(password: string, stored: string) {
 const [salt, expected] = stored.split(':');
 const key = await derive(password,salt,64) as Buffer;
 const bytes = Buffer.from(expected,'hex');
 return bytes.length===key.length && timingSafeEqual(bytes,key);
}
function encryptionKey() {
 const key = Buffer.from(process.env.NEXUS_ENCRYPTION_KEY ?? '', 'base64');
 if(key.length!==32) throw new Error('Configure a 32-byte NEXUS_ENCRYPTION_KEY');
 return key;
}
export function seal(secret: string, owner: string, connection: string) {
 const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
 cipher.setAAD(Buffer.from(`${owner}:${connection}:v1`));
 const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),encrypted.toString('base64')].join('.');
}
export function unseal(secret: string, owner: string, connection: string) {
 const [version,iv,tag,data]=secret.split('.');
 if(version!=='v1') throw new Error('Unsupported key version');
 const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64'));
 cipher.setAAD(Buffer.from(`${owner}:${connection}:v1`)); cipher.setAuthTag(Buffer.from(tag,'base64'));
 return Buffer.concat([cipher.update(Buffer.from(data,'base64')),cipher.final()]).toString('utf8');
}
export async function rateLimit(db: Db, key: string, max: number, seconds=60) {
 const [r]=await db.query<{hits:number}>(`INSERT INTO rate_limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second')
 ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END,
 expires_at=CASE WHEN rate_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING hits`,[key,seconds]);
 if(r.hits>max) throw new Fault(429,'Limite de solicitações. Aguarde e tente novamente.');
}
export async function sessionUser(db: Db, session: string|undefined): Promise<User> {
 demand(session,'Entre para continuar.',401);
 const [user]=await db.query<User>(`SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id
 WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(session)]);
 demand(user,'Sessão expirada. Entre novamente.',401); return user;
}
