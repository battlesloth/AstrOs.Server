import passport from 'passport';
import jsonwebtoken from 'jsonwebtoken';
import { Kysely } from 'kysely';
import { logger } from 'src/logger.js';
import { User } from 'src/models/users.js';
import { Database } from 'src/dal/types.js';
import { UserRepository } from 'src/dal/repositories/user_repository.js';
import { Router } from 'express';

const route = '/login';
const reauthRoute = '/reauth';
const changePasswordRoute = '/changePassword';

// The system ships a single seeded account ('admin', from migration_0). The JWT
// proves the caller is authenticated but not which user, so password changes
// target the seeded admin by name. (The login auth strategy looks users up by
// the posted username; it isn't hardcoded to 'admin'.) If multi-user is ever
// added, derive this from the JWT 'name' claim instead.
const ADMIN_USERNAME = 'admin';

// Minimum length for a new password. Length only — no complexity rule by design.
const MIN_PASSWORD_LENGTH = 8;

export function registerAuthRoutes(router: Router, auth: any, db: Kysely<Database>) {
  router.post(route, login);
  router.post(reauthRoute, reauth);
  router.post(changePasswordRoute, auth, (req: any, res: any, next: any) =>
    changePassword(db, req, res, next),
  );
}

async function login(req: any, res: any, next: any) {
  passport.authenticate('local', (err: any, user: any, info: any) => {
    // If Passport throws/catches an error
    if (err) {
      res.status(500).json(err);
      return;
    }

    // If a user is found
    if (user) {
      const token = user.generateJwt();
      res.status(200);
      res.json({
        token: token,
      });
    } else {
      // If user is not found
      res.status(401).json(info);
    }
  })(req, res);
}

async function reauth(req: any, res: any, next: any) {
  try {
    const jwtKey: string = process.env.JWT_KEY as string;

    const result = jsonwebtoken.verify(req.body.token, jwtKey) as any;

    if (result.exp) {
      const buffer = Date.now() - 60 * 60 * 1000;

      logger.debug(buffer);
      // if it expired less than an hour ago, renew
      if (result.exp * 1000 > buffer) {
        const user = new User(result.name);
        const newtoken = user.generateJwt();
        res.status(200);
        res.json({ token: newtoken });
      } else {
        res.status(401);
        res.json({
          message: 'token expired',
        });
      }
    } else {
      res.status(401);
      res.json({
        message: 'token not valid',
      });
    }
  } catch (error) {
    logger.error(error);

    res.status(500);
    res.json({
      message: 'Internal server error',
    });
  }
}

export async function changePassword(db: Kysely<Database>, req: any, res: any, next: any) {
  try {
    const newPassword: unknown = req.body?.newPassword;

    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      res.status(400);
      res.json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }

    // Coerce a non-string old password to '' so it fails validation as a
    // wrong-password 403 rather than throwing inside pbkdf2Sync.
    const oldPassword = typeof req.body?.oldPassword === 'string' ? req.body.oldPassword : '';

    const repository = new UserRepository(db);
    const user = await repository.getByUsername(ADMIN_USERNAME);

    if (!user.validatePassword(oldPassword)) {
      // 403, not 401: the caller IS authenticated (valid JWT) but supplied the
      // wrong current password. The frontend's global 401 interceptor clears the
      // session and redirects to login, so a 401 here would log the user out
      // mid-change instead of surfacing the error in the modal.
      res.status(403);
      res.json({ message: 'Current password is incorrect' });
      return;
    }

    user.setPassword(newPassword);
    await repository.updatePassword(user);

    res.status(200);
    res.json({ message: 'success' });
  } catch (error) {
    // Intentionally collapses every unexpected failure (a missing admin row
    // from getByUsername/updatePassword, a transient DB fault) into a generic
    // 500. The full error is logged for the operator; the client maps any
    // non-403 to a generic "check logs" message.
    logger.error('changePassword failed', error);

    res.status(500);
    res.json({
      message: 'Internal server error',
    });
  }
}
