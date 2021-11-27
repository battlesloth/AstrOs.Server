const ctrlAuth = require('../controllers/authentication_controller');
const ctrlModule = require('../controllers/module_controller')

const jwt = require('express-jwt');
const auth = jwt({
    secret: process.env.JWT_KEY,
    algorithms: ['HS256'],
    userProperty: 'payload'
});

const express = require('express');
const router = express.Router();

router.get('/modules/', auth, ctrlModule.getModules);
router.post('/modules/', auth, ctrlModule.saveModules);

router.post('/login', ctrlAuth.login);

module.exports = router;
