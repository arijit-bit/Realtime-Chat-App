const User = require('../models/User');

const formatAutoPilotSettings = (user) => ({
    enabled: Boolean(user.autoPilot?.enabled),
    scope: user.autoPilot?.scope || 'all',
    selectedContactIds: (user.autoPilot?.selectedContacts || []).map((contactId) => contactId.toString())
});

const validatePassword = (password) => {
    if (!password || password.length < 8) {
        return 'Password must be at least 8 characters long';
    }

    if (!/[A-Z]/.test(password)) {
        return 'Password must include at least one uppercase letter';
    }

    if (!/[a-z]/.test(password)) {
        return 'Password must include at least one lowercase letter';
    }

    if (!/[0-9]/.test(password)) {
        return 'Password must include at least one number';
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
        return 'Password must include at least one special character';
    }

    return null;
};

const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        
        const formattedUsers = users.map(user => ({
            id: user._id,
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            onlineStatus: user.onlineStatus
        }));
        
        res.json(formattedUsers);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET /api/users/search?q=<query>&currentUserId=<id>
// Returns:
//   { savedContacts: [...], unknownUser: {...} | null }
// savedContacts = contacts whose email/username contain the query string
// unknownUser   = exact email match that is NOT in the user's contacts (for "Add" suggestion)
const searchUsers = async (req, res) => {
    try {
        const { q, currentUserId } = req.query;
        if (!q || !q.trim()) return res.status(400).json({ message: 'Query is required' });

        const query = q.trim().toLowerCase();

        // Fetch the current user to get their contacts list
        const currentUser = await User.findById(currentUserId).select('contacts email');
        if (!currentUser) return res.status(404).json({ message: 'Current user not found' });

        const contactEmails = currentUser.contacts || [];

        // Find all users whose emails are in the contacts list AND match the query
        const savedContactDocs = await User.find({
            email: { $in: contactEmails },
            $or: [
                { email: { $regex: query, $options: 'i' } },
                { username: { $regex: query, $options: 'i' } }
            ]
        }).select('-password');

        const savedContacts = savedContactDocs.map(u => ({
            id: u._id,
            username: u.username,
            email: u.email,
            avatar: u.avatar,
            onlineStatus: u.onlineStatus
        }));

        // Only do exact-email lookup for "unknown" user if query looks like a full email
        let unknownUser = null;
        if (query.includes('@')) {
            const exactMatch = await User.findOne({ email: query }).select('-password');
            if (exactMatch && exactMatch._id.toString() !== currentUserId) {
                const isAlreadyContact = contactEmails.includes(exactMatch.email.toLowerCase());
                if (!isAlreadyContact) {
                    unknownUser = {
                        id: exactMatch._id,
                        username: exactMatch.username,
                        email: exactMatch.email,
                        avatar: exactMatch.avatar,
                        onlineStatus: exactMatch.onlineStatus
                    };
                }
            }
        }

        res.json({ savedContacts, unknownUser });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// GET /api/users/:id/contacts  — return full user objects for the contact emails
const getUserContacts = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('contacts');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const contactDocs = await User.find({ email: { $in: user.contacts } }).select('-password');
        const contacts = contactDocs.map(u => ({
            id: u._id,
            username: u.username,
            email: u.email,
            avatar: u.avatar,
            onlineStatus: u.onlineStatus
        }));

        res.json(contacts);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// POST /api/users/:id/contacts  body: { contactEmail }
const addContact = async (req, res) => {
    try {
        const { contactEmail } = req.body;
        const userId = req.params.id;

        if (!contactEmail) return res.status(400).json({ message: 'contactEmail is required' });

        // Make sure the contact user actually exists
        const contactUser = await User.findOne({ email: contactEmail.toLowerCase().trim() });
        if (!contactUser) return res.status(404).json({ message: 'No user found with that email' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const email = contactUser.email.toLowerCase();
        if (user.contacts.includes(email)) {
            return res.status(400).json({ message: 'Already in contacts' });
        }

        user.contacts.push(email);
        await user.save();

        res.json({
            message: 'Contact added successfully',
            contact: {
                id: contactUser._id,
                username: contactUser.username,
                email: contactUser.email,
                avatar: contactUser.avatar,
                onlineStatus: contactUser.onlineStatus
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { username } = req.body;
        const userId = req.params.id;

        if (!username || username.trim() === '') {
            return res.status(400).json({ message: 'Username cannot be empty' });
        }

        const existingUser = await User.findOne({ username, _id: { $ne: userId } });
        if (existingUser) {
            return res.status(400).json({ message: 'Username is already taken' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { username },
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email,
            avatar: updatedUser.avatar,
            onlineStatus: updatedUser.onlineStatus
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.params.id;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current password and new password are required' });
        }

        const passwordError = validatePassword(newPassword);
        if (passwordError) {
            return res.status(400).json({ message: passwordError });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const passwordMatches = await user.matchPassword(currentPassword);
        if (!passwordMatches) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getAutoPilotSettings = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('autoPilot');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(formatAutoPilotSettings(user));
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateAutoPilotSettings = async (req, res) => {
    try {
        const userId = req.params.id;
        const { enabled, scope, selectedContactIds = [] } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ message: 'enabled must be a boolean' });
        }

        if (!['all', 'selected'].includes(scope)) {
            return res.status(400).json({ message: 'scope must be either "all" or "selected"' });
        }

        if (!Array.isArray(selectedContactIds)) {
            return res.status(400).json({ message: 'selectedContactIds must be an array' });
        }

        const user = await User.findById(userId).select('autoPilot');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const normalizedSelectedContacts = [
            ...new Set(
                selectedContactIds
                    .map((contactId) => String(contactId || '').trim())
                    .filter((contactId) => contactId && contactId !== userId)
            )
        ];

        user.autoPilot = {
            enabled,
            scope,
            selectedContacts: scope === 'selected' ? normalizedSelectedContacts : []
        };

        await user.save();

        res.json(formatAutoPilotSettings(user));
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    getAllUsers,
    searchUsers,
    getUserContacts,
    addContact,
    updateProfile,
    changePassword,
    getAutoPilotSettings,
    updateAutoPilotSettings
};
