var passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/users');
const DataAccess = require('../dal/data_access');
const UserRepository = require('../dal/user_repository');

passport.use(
    new LocalStrategy(
      {
        usernameField: 'username'
      },
      async function(username, password, done) {
        const dao = new DataAccess();
        const repo = new UserRepository(dao);

        var user = await repo.getByUsername(username);

        // Return if user not found in database
        if (!user) {
            return done(null, false, {
                message: 'User not found'
            });
        }
        // Return if password is wrong
        if (!user.validatePassword(password)) {
            return done(null, false, {
                message: 'Password is wrong'
            });
        }
        // If credentials are correct, return the user object
        return done(null, user);
      }
    )
  );