import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { profiles, roles, users } from '../../db/schema.ts';
import { ensureDatabaseSeeded } from '../../db/seed.ts';
import {
  authenticateToken,
  getUserWithProfileByUid,
  requireAuth,
  signAppToken,
} from '../../middleware/auth.ts';
import type { AuthRequest } from '../../middleware/auth.ts';

const router = Router();

function setSessionCookie(res: any, token: string) {
  res.cookie('sc_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    await ensureDatabaseSeeded();
    const { email, password, fullName, department, enrollmentId, phone } = req.body || {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Please provide a valid college email address.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({ error: 'Please enter your full name.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const studentRole = await db
      .select()
      .from(roles)
      .where(eq(roles.name, 'student'))
      .limit(1);

    if (!studentRole[0]) {
      return res.status(500).json({ error: 'System roles not initialized.' });
    }

    const uid = `local-${crypto.randomUUID()}`;
    const passwordHash = await bcrypt.hash(password, 10);

    const [createdUser] = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        passwordHash,
        roleId: studentRole[0].id,
        roleName: 'student',
        isActive: true,
        isDemo: false,
      })
      .returning();

    await db.insert(profiles).values({
      userId: createdUser.id,
      fullName: fullName.trim(),
      department: typeof department === 'string' && department.trim() ? department.trim() : 'General Studies',
      enrollmentId: typeof enrollmentId === 'string' ? enrollmentId.trim() : '',
      phone: typeof phone === 'string' ? phone.trim() : '',
    });

    const user = await getUserWithProfileByUid(uid);
    if (!user) {
      return res.status(500).json({ error: 'Failed to load created profile.' });
    }

    const token = signAppToken({ userId: user.id, uid: user.uid, role: user.roleName });
    setSessionCookie(res, token);

    return res.status(201).json({ user, token });
  } catch (error: any) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    await ensureDatabaseSeeded();
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const userRow = rows[0];
    if (!userRow.passwordHash) {
      return res.status(401).json({
        error: 'This account uses Google Sign-In. Please click "Continue with Google".',
      });
    }

    const passwordMatches = await bcrypt.compare(password, userRow.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!userRow.isActive) {
      return res.status(403).json({
        error: 'This account has been deactivated by an administrator.',
      });
    }

    const user = await getUserWithProfileByUid(userRow.uid);
    if (!user) {
      return res.status(500).json({ error: 'Failed to load user profile.' });
    }

    const token = signAppToken({ userId: user.id, uid: user.uid, role: user.roleName });
    setSessionCookie(res, token);

    return res.json({ user, token });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/auth/firebase
router.post('/firebase', async (req, res) => {
  try {
    await ensureDatabaseSeeded();
    const idToken =
      req.body?.idToken ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : null);

    if (!idToken) {
      return res.status(400).json({ error: 'Missing Firebase ID token.' });
    }

    const user = await authenticateToken(idToken);
    if (!user) {
      return res.status(401).json({ error: 'Invalid Google sign-in token.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account deactivated by administrator.' });
    }

    const appToken = signAppToken({ userId: user.id, uid: user.uid, role: user.roleName });
    setSessionCookie(res, appToken);

    return res.json({ user, token: appToken });
  } catch (error) {
    console.error('Firebase auth sync error:', error);
    return res.status(500).json({ error: 'Failed to verify Google Sign-In.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('sc_session', { path: '/' });
  return res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  return res.json({ user: req.authUser });
});

// PATCH /api/auth/profile
router.patch('/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.authUser!;
    const { fullName, department, enrollmentId, phone } = req.body || {};

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    }

    await db
      .update(profiles)
      .set({
        fullName: fullName.trim(),
        department: typeof department === 'string' ? department.trim() : authUser.department,
        enrollmentId: typeof enrollmentId === 'string' ? enrollmentId.trim() : authUser.enrollmentId,
        phone: typeof phone === 'string' ? phone.trim() : authUser.phone,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, authUser.id));

    const updated = await getUserWithProfileByUid(authUser.uid);
    return res.json({ user: updated });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.authUser!;
    const { currentPassword, newPassword } = req.body || {};

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, authUser.id))
      .limit(1);

    const userRow = rows[0];
    if (!userRow) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (userRow.passwordHash) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, userRow.passwordHash))) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, authUser.id));

    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Password change error:', error);
    return res.status(500).json({ error: 'Failed to update password.' });
  }
});

export default router;
