const mongoose = require('mongoose');
const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const User = require('../models/User');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildDmRegex = (userId) => {
    const safeUserId = escapeRegex(userId);
    return new RegExp(`^${safeUserId}_.+|^.+_${safeUserId}$`);
};

const getConversations = async (req, res) => {
    try {
        const { userId } = req.query; 
        if (!userId) return res.status(400).json({ message: "userId query param required" });

        const globalRoom = await ChatRoom.findOne({ roomName: 'Global Lounge' }).lean();

        // Get groups the user belongs to
        const groups = await ChatRoom.find({ members: userId, isGroupChat: true }).lean();
        const dmRooms = await ChatRoom.find({ roomName: buildDmRegex(userId) }).lean();

        const conversations = [];
        const roomIds = [
            ...groups,
            ...dmRooms,
            ...(globalRoom ? [globalRoom] : [])
        ].map((room) => room._id);
        const roomObjectIds = roomIds.map((id) => new mongoose.Types.ObjectId(id));

        const [latestMessages, unreadCounts] = await Promise.all([
            roomObjectIds.length > 0
                ? Message.aggregate([
                    { $match: { roomId: { $in: roomObjectIds } } },
                    { $sort: { timestamp: -1 } },
                    {
                        $group: {
                            _id: '$roomId',
                            content: { $first: '$content' },
                            timestamp: { $first: '$timestamp' }
                        }
                    }
                ])
                : [],
            roomObjectIds.length > 0
                ? Message.aggregate([
                    {
                        $match: {
                            roomId: { $in: roomObjectIds },
                            senderId: { $ne: new mongoose.Types.ObjectId(userId) },
                            isRead: false
                        }
                    },
                    { $group: { _id: '$roomId', count: { $sum: 1 } } }
                ])
                : []
        ]);

        const latestMessageByRoomId = new Map(
            latestMessages.map((message) => [message._id.toString(), message])
        );
        const unreadCountByRoomId = new Map(
            unreadCounts.map((item) => [item._id.toString(), item.count])
        );

        const peerUserIds = [
            ...new Set(
                dmRooms
                    .map((room) => room.roomName.split('_').find((id) => id !== userId))
                    .filter(Boolean)
            )
        ];
        const peerUsers = peerUserIds.length > 0
            ? await User.find({ _id: { $in: peerUserIds } }).select('username onlineStatus').lean()
            : [];
        const peerUserById = new Map(peerUsers.map((user) => [user._id.toString(), user]));

        // Map Groups
        for (let group of groups) {
            const roomId = group._id.toString();
            const lastMsg = latestMessageByRoomId.get(roomId);
            const unreadCount = unreadCountByRoomId.get(roomId) || 0;

            conversations.push({
                id: group.roomName, 
                name: group.roomName,
                isGroup: true,
                lastMessage: lastMsg ? lastMsg.content : "Created explicitly. Say hi!",
                lastMessageTime: lastMsg ? lastMsg.timestamp : new Date(0), // Push to bottom if empty
                unreadCount,
                onlineStatus: false
            });
        }

        // Map 1-1 rooms
        for (let room of dmRooms) {
            const roomId = room._id.toString();
            const lastMsg = latestMessageByRoomId.get(roomId);
            if (!lastMsg) {
                continue;
            }

            const targetUserId = room.roomName.split('_').find((id) => id !== userId);
            const targetUser = peerUserById.get(targetUserId);
            if (!targetUser) {
                continue;
            }

            conversations.push({
                id: room.roomName,
                name: targetUser.username,
                isGroup: false,
                targetUserId,
                lastMessage: lastMsg.content,
                lastMessageTime: lastMsg.timestamp,
                unreadCount: unreadCountByRoomId.get(roomId) || 0,
                onlineStatus: targetUser.onlineStatus
            });
        }

        // Sort descending (most recent message at the top)
        conversations.sort((a,b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

        // Let's add "Global Lounge" unconditionally for fallback parity
        if (globalRoom) {
            const roomId = globalRoom._id.toString();
            const lastMsg = latestMessageByRoomId.get(roomId);
            const unreadCount = unreadCountByRoomId.get(roomId) || 0;
            conversations.unshift({
                id: 'Global Lounge',
                name: 'Global Lounge',
                isGroup: true,
                lastMessage: lastMsg ? lastMsg.content : "Welcome to the global chat!",
                lastMessageTime: lastMsg ? lastMsg.timestamp : new Date(),
                unreadCount,
                onlineStatus: false
            });
        } else {
             conversations.unshift({
                id: 'Global Lounge',
                name: 'Global Lounge',
                isGroup: true,
                lastMessage: "Welcome to the global chat!",
                lastMessageTime: new Date(),
                unreadCount: 0,
                onlineStatus: false
            });
        }

        res.json(conversations);
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Server Error fetching aggregated conversations" });
    }
}

module.exports = { getConversations };
