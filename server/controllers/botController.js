const { CallAPI } = require('../utils/llm-api');

// @desc    Auto-reply bot endpoint
// @route   POST /api/bot/reply
// @access  Public (or update to Private as needed)
const generateBotReply = async (req, res) => {
    try {
        const { message, context } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, message: 'Message is required' });
        }

        const prompt = context 
            ? `Context: ${context}\n\nUser: ${message}\n\nPlease generate a helpful reply as an auto-reply bot.`
            : `User: ${message}\n\nPlease generate a helpful reply as an auto-reply bot.`;

        // Using the central API with fail-safe mechanism
        const reply = await CallAPI(prompt, 'auto');

        res.status(200).json({ success: true, reply });
    } catch (error) {
        console.error('Bot reply error:', error.message);
        res.status(500).json({ success: false, message: 'Bot failed to reply', error: error.message });
    }
};

module.exports = {
    generateBotReply
};
