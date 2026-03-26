import passport from 'passport';
import jsonwebtoken from 'jsonwebtoken';
import { logger } from '../logger.js';
import { User } from '../models/users.js';
import { Router } from 'express';

const route = '/login';
const reauthRoute = '/reauth';

export function registerAuthRoutes(router: Router) {
  router.post(route, login);
  router.post(reauthRoute, reauth);
}

async function login(req: any, res: any, next: any) {
  passport.authenticate('local', (err: any, user: any, info: any) => {
    // If Passport throws/catches an error
    if (err) {
      res.status(404).json(err);
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
