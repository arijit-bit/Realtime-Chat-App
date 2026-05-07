const User = require('../models/User');
const generateToken = require('../utils/generateToken');

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
    try {
        const { username, email, password, avatar } = req.body;

        // Check username and email separately to give specific error messages
        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            return res.status(400).json({ message: 'Username already taken' });
        }

        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const user = await User.create({
            username,
            email,
            password,
            avatar: avatar || '',
            onlineStatus: true
        });

        if (user) {
            res.status(201).json({
                id: user._id,
                username: user.username,
                email: user.email,
                avatar: user.avatar,
                onlineStatus: user.onlineStatus,
                token: generateToken(user._id)
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Check if a username is available
// @route   GET /api/auth/check-username?username=xxx
// @access  Public
const checkUsername = async (req, res) => {
    try {
        const { username } = req.query;

        if (!username || username.trim().length < 3) {
            return res.status(400).json({ message: 'Username must be at least 3 characters' });
        }

        const exists = await User.findOne({ username: username.trim() });
        res.json({ available: !exists });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Auth user & get token (login with username instead of email)
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });

        if (user && (await user.matchPassword(password))) {
            // Set online status to true
            user.onlineStatus = true;
            await user.save();

            res.json({
                id: user._id,
                username: user.username,
                email: user.email,
                avatar: user.avatar,
                onlineStatus: user.onlineStatus,
                token: generateToken(user._id)
            });
        } else {
            res.status(401).json({ message: 'Invalid username or password' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    registerUser,
    checkUsername,
    loginUser
};
