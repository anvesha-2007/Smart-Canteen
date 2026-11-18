import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { profiles, roles, users } from '../db/schema.ts';

export type UserRole = 'student' | 'staff' | 'admin';

export interface AuthenticatedUser {
  id: number;
  uid: string;
  email: string;
  roleName: UserRole;
  isActive: boolean;
  isDemo: boolean;
  fullName: string;
  department: string;
  enrollmentId: string;
  phone: string;
  avatarUrl: string;
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

const JWT_SECRET =
  process.env.JWT_SECRET || 'smart-canteen-dev-secret-key-change-in-prod';

export function signAppToken(payload: { userId: number; uid: string; role: UserRole }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyAppToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as {
    userId: number;
    uid: string;
    role: UserRole;
  };
}

export async function getUserWithProfileByUid(uid: string): Promise<AuthenticatedUser | null> {
  try {
    const rows = await db
      .select({
        id: users.id,
        uid: users.uid,
        email: users.email,
        roleName: users.roleName,
        isActive: users.isActive,
        isDemo: users.isDemo,
        fullName: profiles.fullName,
        department: profiles.department,
        enrollmentId: profiles.enrollmentId,
        phone: profiles.phone,
        avatarUrl: profiles.avatarUrl,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.uid, uid))
      .limit(1);

    if (!rows.length) return null;
    const row = rows[0];
    return {
      id: row.id,
      uid: row.uid,
      email: row.email,
      roleName: (row.roleName as UserRole) || 'student',
      isActive: row.isActive,
      isDemo: row.isDemo,
      fullName: row.fullName || row.email.split('@')[0],
      department: row.department || 'Campus Member',
      enrollmentId: row.enrollmentId || '',
      phone: row.phone || '',
      avatarUrl: row.avatarUrl || '',
    };
  } catch (error) {
    console.error('Database query failed in getUserWithProfileByUid:', error);
    throw new Error('Failed to load user profile', { cause: error });
  }
}

export async function upsertFirebaseUser(
  uid: string,
  email: string,
  displayName?: string,
  picture?: string
): Promise<AuthenticatedUser> {
  try {
    const existing = await getUserWithProfileByUid(uid);
    if (existing) {
      return existing;
    }

    // Check if email already exists (e.g. pre-created account linking to Google)
    const byEmail = await db
      .select({ id: users.id, uid: users.uid })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (byEmail.length > 0) {
      await db
        .update(users)
        .set({ uid, updatedAt: new Date() })
        .where(eq(users.id, byEmail[0].id));
      const updated = await getUserWithProfileByUid(uid);
      if (updated) return updated;
    }

    const studentRole = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'student'))
      .limit(1);

    let roleId = studentRole[0]?.id;
    if (!roleId) {
      const insertedRole = await db
        .insert(roles)
        .values({ name: 'student', description: 'College Student or Staff Member' })
        .onConflictDoNothing()
        .returning();
      roleId = insertedRole[0]?.id ?? 1;
    }

    const insertedUser = await db
      .insert(users)
      .values({
        uid,
        email: email.toLowerCase(),
        roleId,
        roleName: 'student',
        isActive: true,
        isDemo: false,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email: email.toLowerCase(), updatedAt: new Date() },
      })
      .returning();

    const userRow = insertedUser[0];

    await db
      .insert(profiles)
      .values({
        userId: userRow.id,
        fullName: displayName || email.split('@')[0],
        department: 'College Campus',
        avatarUrl: picture || '',
      })
      .onConflictDoNothing();

    const fullUser = await getUserWithProfileByUid(uid);
    if (!fullUser) {
      throw new Error('Failed to retrieve upserted user');
    }
    return fullUser;
  } catch (error) {
    console.error('Database query failed in upsertFirebaseUser:', error);
    throw new Error('Failed to synchronize user account', { cause: error });
  }
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const [key, ...rest] = part.trim().split('=');
      if (key === 'sc_session') {
        return decodeURIComponent(rest.join('='));
      }
    }
  }
  return null;
}

export async function authenticateToken(token: string): Promise<AuthenticatedUser | null> {
  // 1. Try local app JWT first (fast, offline-capable)
  try {
    const decoded = verifyAppToken(token);
    const user = await getUserWithProfileByUid(decoded.uid);
    return user;
  } catch {
    // Not a local app JWT — verify as Firebase ID token
  }

  try {
    const decodedFirebase = await adminAuth.verifyIdToken(token);
    const email = decodedFirebase.email || `${decodedFirebase.uid}@campus.edu`;
    const user = await upsertFirebaseUser(
      decodedFirebase.uid,
      email,
      decodedFirebase.name,
      decodedFirebase.picture
    );
    return user;
  } catch (err) {
    console.error('Token verification failed:', err);
    return null;
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  try {
    const user = await authenticateToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
    }
    if (!user.isActive) {
      return res.status(403).json({
        error: 'Your account has been deactivated by an administrator. Contact the canteen office.',
      });
    }
    req.authUser = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication service error' });
  }
};

export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.authUser.roleName)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
    }
    next();
  };
};
