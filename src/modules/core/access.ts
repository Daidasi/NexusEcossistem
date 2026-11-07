import { randomUUID } from 'node:crypto';
import type { Db } from '../storage/db';
import { demand, type Room, type User } from './domain';
export async function member(db: Db, user: User, roomId: string): Promise<Room> {
 const [room] = await db.query<Room>(`SELECT r.* FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE r.id=$1 AND m.user_id=$2`,[roomId,user.id]);
 demand(room); return room;
}
export async function projectMember(db: Db, user: User, projectId: string) {
 const [m]=await db.query('SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2',[projectId,user.id]); demand(m);
}
export async function audit(db: Db, actorId: string, action: string, targetId: string|null, roomId: string|null, details: object={}) {
 await db.query('INSERT INTO audit(id,actor_id,action,target_id,room_id,details) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),actorId,action,targetId,roomId,JSON.stringify(details)]);
}
