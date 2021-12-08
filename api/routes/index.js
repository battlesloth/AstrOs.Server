const ctrlAuth = require('../controllers/authentication_controller');
const ctrlControllers = require('../controllers/controller_controller')

const jwt = require('express-jwt');
const auth = jwt({
    secret: process.env.JWT_KEY,
    algorithms: ['HS256'],
    userProperty: 'payload'
});

const express = require('express');
const router = express.Router();

router.get('/controllers/', auth, ctrlControllers.getControllers);
router.put('/controllers/', auth, ctrlControllers.saveControllers);

router.post('/login', ctrlAuth.login);

module.exports = router;
