const express = require('express');
const router = express.Router();
const { registerUser, checkUsername, loginUser } = require('../controllers/authController');

router.get('/check-username', checkUsername);
router.post('/register', registerUser);
router.post('/login', loginUser);

module.exports = router;
