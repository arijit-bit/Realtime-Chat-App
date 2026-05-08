const Message = require('../models/Message');
const ChatRoom = require('../models/ChatRoom');

// @desc    Get messages by room name
// @route   GET /api/messages/:roomId
// @access  Public (in reality should be protected, but keeping it open per simplicity unless auth is mounted)
const getMessages = async (req, res) => {
    try {
        const roomName = req.params.roomId;
        const limit = parseInt(req.query.limit) || 50;
        const skip = parseInt(req.query.skip) || 0;
        
        let room = await ChatRoom.findOne({ roomName });
        if (!room) {
            return res.json({ messages: [], hasMore: false });
        }

        const totalMessages = await Message.countDocuments({ roomId: room._id });
        
        const messages = await Message.find({ roomId: room._id })
            .populate('senderId', 'username avatar')
            .sort({ timestamp: -1 }) // Sort newest to oldest for pagination
            .skip(skip)
            .limit(limit);

        // Reverse to return oldest to newest (chronological order)
        messages.reverse();

        const formattedMessages = messages.map(msg => ({
            id: msg._id,
            roomId: roomName,
            senderId: msg.senderId ? msg.senderId._id : null,
            senderName: msg.senderId ? msg.senderId.username : 'Unknown',
            content: msg.content,
            timestamp: msg.timestamp,
            isAutomated: Boolean(msg.isAutomated),
            isRead: msg.isRead
        }));

        res.json({
            messages: formattedMessages,
            hasMore: skip + messages.length < totalMessages
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching messages', error: error.message });
    }
};

module.exports = { getMessages };
