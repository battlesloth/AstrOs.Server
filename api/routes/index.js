const ctrlAuth = require('../controllers/authentication');
const ctrlProfile = require('../controllers/profile');

const jwt = require('express-jwt');
const auth = jwt({
    secret: process.env.JWT_KEY,
    algorithms: ['HS256'],
    userProperty: 'payload'
});

const express = require('express');
const router = express.Router();

router.get('/profile/', auth, ctrlProfile.profileRead);

router.post('/login', ctrlAuth.login);

module.exports = router;
