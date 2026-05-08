require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');
const { CallAPI } = require('./utils/llm-api');

const Message = require('./models/Message');
const ChatRoom = require('./models/ChatRoom');
const User = require('./models/User');

connectDB();

const app = express();

const allowedOrigins = [
  'https://pegion-mail.vercel.app',
  'http://localhost:3000',
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/conversations', require('./routes/conversationRoutes'));
app.use('/api/bot', require('./routes/botRoutes'));
app.use('/api/system', require('./routes/systemRoutes'));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const userSocketMap = new Map();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isDirectMessageRoom = (roomName = '') => {
  const parts = String(roomName).split('_');
  return parts.length === 2 && parts.every(Boolean);
};

const getDirectParticipants = (roomName = '') => (
  isDirectMessageRoom(roomName) ? String(roomName).split('_') : []
);

const getRecipientIdForRoom = (roomName, senderId) => (
  getDirectParticipants(roomName).find((participantId) => participantId !== String(senderId)) || null
);

const ensureRoomExists = async (roomName) => {
  let room = await ChatRoom.findOne({ roomName });
  const directParticipants = getDirectParticipants(roomName);
  const shouldBeDirectMessage = isDirectMessageRoom(roomName);

  if (room) {
    const nextIsGroupChat = !shouldBeDirectMessage;
    const hasCorrectGroupFlag = room.isGroupChat === nextIsGroupChat;
    const hasExpectedMembers = !shouldBeDirectMessage
      || directParticipants.every((participantId) =>
        (room.members || []).some((member) => member.toString() === participantId),
      );

    if (!hasCorrectGroupFlag || !hasExpectedMembers) {
      room.isGroupChat = nextIsGroupChat;
      if (shouldBeDirectMessage) {
        room.members = directParticipants;
      }
      await room.save();
    }

    return room;
  }

  room = await ChatRoom.create({
    roomName,
    isGroupChat: !shouldBeDirectMessage,
    members: directParticipants,
  });

  return room;
};

const addRecipientToContacts = async (senderId, recipientId) => {
  if (!recipientId) {
    return;
  }

  try {
    const recipient = await User.findById(recipientId).select('email');
    if (!recipient) {
      return;
    }

    await User.findByIdAndUpdate(
      senderId,
      { $addToSet: { contacts: recipient.email } },
    );
  } catch (error) {
    console.error('Auto-add contact error:', error.message);
  }
};

const emitConversationUpdate = (room, roomId, content, senderId) => {
  let memberIds = (room.members || []).map((member) => member.toString());

  if (memberIds.length === 0 && isDirectMessageRoom(roomId)) {
    memberIds = getDirectParticipants(roomId);
  }

  memberIds.forEach((memberId) => {
    const memberSocketId = userSocketMap.get(memberId);
    if (memberSocketId && memberId !== String(senderId)) {
      io.to(memberSocketId).emit('new_conversation', {
        roomId,
        lastMessage: content,
        senderId,
      });
    }
  });
};

const emitAutoPilotTyping = (roomId, username) => {
  io.to(roomId).emit('user_typing', { username, roomId });
};

const emitAutoPilotStopTyping = (roomId, username) => {
  io.to(roomId).emit('user_stop_typing', { username, roomId });
};

const persistAndBroadcastMessage = async ({
  roomId,
  senderId,
  senderName,
  content,
  clientTempId,
  isAutomated = false,
}) => {
  const room = await ensureRoomExists(roomId);
  const isDirectRoom = isDirectMessageRoom(roomId);
  const recipientId = isDirectRoom ? getRecipientIdForRoom(roomId, senderId) : null;

  const newMessage = await Message.create({
    roomId: room._id,
    senderId,
    receiverId: recipientId || undefined,
    content,
    isAutomated,
  });

  const broadcastData = {
    roomId,
    senderId,
    senderName,
    content,
    timestamp: newMessage.timestamp,
    id: newMessage._id,
    isRead: false,
    clientTempId,
    isAutomated,
  };

  io.to(roomId).emit('receive_message', broadcastData);

  if (recipientId) {
    await addRecipientToContacts(senderId, recipientId);
  }

  emitConversationUpdate(room, roomId, content, senderId);

  return {
    room,
    recipientId,
    newMessage,
    broadcastData,
  };
};

const buildAutoPilotPrompt = async ({ roomDbId, autoPilotUserId, latestMessage }) => {
  const recentMessages = await Message.find({ roomId: roomDbId })
    .populate('senderId', 'username')
    .sort({ timestamp: -1 })
    .limit(16);

  const orderedMessages = recentMessages.reverse();
  const previousMessages = orderedMessages.slice(0, -1).slice(-15);

  const history = previousMessages.length > 0
    ? previousMessages
      .map((message) => {
        const isYou = String(message.senderId?._id) === String(autoPilotUserId);
        return `${isYou ? 'you' : (message.senderId?.username || 'person')}: ${message.content}`;
      })
      .join('\n')
    : 'No earlier messages.';

  return [
    'Act as a chat bot.',
    'Make a to-the-point response.',
    'Act like a human.',
    `These were previous messages:\n${history}`,
    `Based on those conversations, reply to the latest message: ${latestMessage}`,
  ].join('\n\n');
};

const maybeSendAutoPilotReply = async ({
  room,
  roomId,
  senderId,
  senderName,
  content,
  isAutomated,
}) => {
  if (isAutomated || !isDirectMessageRoom(roomId)) {
    return;
  }

  const autoPilotUserId = getRecipientIdForRoom(roomId, senderId);
  if (!autoPilotUserId) {
    return;
  }

  const autoPilotUser = await User.findById(autoPilotUserId).select('username autoPilot');
  if (!autoPilotUser || !autoPilotUser.autoPilot?.enabled) {
    return;
  }

  if (autoPilotUser.autoPilot.scope === 'selected') {
    const selectedIds = (autoPilotUser.autoPilot.selectedContacts || [])
      .map((contactId) => contactId.toString());

    if (!selectedIds.includes(String(senderId))) {
      return;
    }
  }

  const prompt = await buildAutoPilotPrompt({
    roomDbId: room._id,
    autoPilotUserId,
    latestMessage: `from ${senderName}: ${content}`,
  });

  emitAutoPilotTyping(roomId, autoPilotUser.username);

  let reply;
  try {
    reply = await CallAPI(prompt, 'auto');
  } catch (error) {
    emitAutoPilotStopTyping(roomId, autoPilotUser.username);
    console.error('Auto-pilot reply generation failed:', error.message);
    return;
  }

  const replyText = String(reply || '').trim();
  if (!replyText) {
    emitAutoPilotStopTyping(roomId, autoPilotUser.username);
    return;
  }

  await delay(1200);
  emitAutoPilotStopTyping(roomId, autoPilotUser.username);

  await persistAndBroadcastMessage({
    roomId,
    senderId: autoPilotUserId,
    senderName: autoPilotUser.username,
    content: replyText,
    isAutomated: true,
  });
};

io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  console.log('User connected:', socket.id, 'UserId:', userId);

  if (userId && userId !== 'undefined') {
    userSocketMap.set(userId, socket.id);
    io.emit('user_status_changed', { userId, status: 'online' });
  }

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
  });

  socket.on('send_message', async (data) => {
    try {
      const { room } = await persistAndBroadcastMessage({
        roomId: data.roomId,
        senderId: data.senderId,
        senderName: data.senderName,
        content: data.content,
        clientTempId: data.clientTempId,
        isAutomated: Boolean(data.isAutomated),
      });

      void maybeSendAutoPilotReply({
        room,
        roomId: data.roomId,
        senderId: data.senderId,
        senderName: data.senderName,
        content: data.content,
        isAutomated: Boolean(data.isAutomated),
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
          { $set: { isRead: true } },
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

    if (userId && userId !== 'undefined') {
      userSocketMap.delete(userId);
      io.emit('user_status_changed', { userId, status: 'offline' });
    }
  });
});

const PORT = process.env.PORT || 5001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} and accessible on the local network`);
});
