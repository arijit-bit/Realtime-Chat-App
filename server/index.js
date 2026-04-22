require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');

// Connect to MongoDB
connectDB();

const app = express();

const allowedOrigins = [
  'https://realtime-chat-app-delta-seven.vercel.app'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/conversations', require('./routes/conversationRoutes'));

const Message = require('./models/Message');
const ChatRoom = require('./models/ChatRoom');
const User = require('./models/User');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const userSocketMap = new Map();

io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  console.log('User connected:', socket.id, 'UserId:', userId);

  if (userId && userId !== "undefined") {
    userSocketMap.set(userId, socket.id);
    io.emit('user_status_changed', { userId, status: 'online' });
  }

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
  });

  socket.on('send_message', async (data) => {
    try {
      let room = await ChatRoom.findOne({ roomName: data.roomId });

      if (!room) {
        room = await ChatRoom.create({
          roomName: data.roomId,
          isGroupChat: true
        });
      }

      const newMessage = await Message.create({
        roomId: room._id,
        senderId: data.senderId,
        content: data.content
      });

      const broadcastData = { ...data, id: newMessage._id, isRead: false };

      // Broadcast message to anyone already in the socket room
      io.to(data.roomId).emit('receive_message', broadcastData);

      // ── Auto-add recipient to sender's contacts for DMs ─────────────────
      // DM room name format: "smallerId_largerId"
      if (data.roomId.includes('_') && !room.isGroupChat) {
        const parts = data.roomId.split('_');
        if (parts.length === 2) {
          const recipientId = parts.find(id => id !== data.senderId);
          if (recipientId) {
            try {
              // Find recipient to get their email
              const recipient = await User.findById(recipientId).select('email');
              if (recipient) {
                // Add recipient's email to sender's contacts (no-op if already there)
                await User.findByIdAndUpdate(
                  data.senderId,
                  { $addToSet: { contacts: recipient.email } }
                );
              }
            } catch (e) {
              console.error('Auto-add contact error:', e.message);
            }
          }
        }
      }

      // For 1-1 DMs: derive both user IDs from the room name (format: "id1_id2")
      // For group rooms: members are stored on the ChatRoom document
      // Either way, emit new_conversation to ALL members' sockets so their
      // sidebars update instantly — even if they haven't joined this socket room yet.
      let memberIds = room.members.map(m => m.toString());

      // If it's a DM room (no members stored), derive from room name
      if (memberIds.length === 0 && data.roomId.includes('_')) {
        memberIds = data.roomId.split('_');
      }

      memberIds.forEach(memberId => {
        const memberSocketId = userSocketMap.get(memberId);
        if (memberSocketId && memberId !== data.senderId) {
          io.to(memberSocketId).emit('new_conversation', {
            roomId: data.roomId,
            lastMessage: data.content,
            senderId: data.senderId
          });
        }
      });

    } catch (error) {
      console.error('Error saving message payload:', error);
    }
  });

  socket.on('messages_read', async (data) => {
    try {
      const room = await ChatRoom.findOne({ roomName: data.roomId });
      if (room) {
        await Message.updateMany(
          { roomId: room._id, senderId: { $ne: data.readerId }, isRead: false },
          { $set: { isRead: true } }
        );
        io.to(data.roomId).emit('read_status_updated', { roomId: data.roomId, readerId: data.readerId });
      }
    } catch (error) {
      console.error('Error updating read status:', error);
    }
  });

  socket.on('typing', (data) => {
    socket.to(data.roomId).emit('user_typing', { username: data.username, roomId: data.roomId });
  });

  socket.on('stop_typing', (data) => {
    socket.to(data.roomId).emit('user_stop_typing', { username: data.username, roomId: data.roomId });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    if (userId && userId !== "undefined") {
      userSocketMap.delete(userId);
      io.emit('user_status_changed', { userId, status: 'offline' });
    }
  });
});

const PORT = process.env.PORT || 5001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} and accessible on the local network`);
});