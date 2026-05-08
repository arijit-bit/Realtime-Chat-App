const express = require('express');
const router = express.Router();
const { generateBotReply } = require('../controllers/botController');

router.post('/reply', generateBotReply);

module.exports = router;
