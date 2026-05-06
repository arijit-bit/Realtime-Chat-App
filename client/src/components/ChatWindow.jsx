import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ImagePlus,
  MoreHorizontal,
  Phone,
  Trash2,
  UserPlus,
  Video,
} from 'lucide-react';
import { API_URL } from '../config';

const formatMessageTime = (value) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDateLabel = (value) => {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
};

const normalizeId = (value) => String(value ?? '');

const StatusIcon = ({ message }) => {
  if (message.isRead) {
    return <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" strokeWidth={2.5} />;
  }

  if (message._optimistic) {
    return <Check className="h-3.5 w-3.5 text-white/65" strokeWidth={2.5} />;
  }

  return <CheckCheck className="h-3.5 w-3.5 text-white/65" strokeWidth={2.5} />;
};

const ChatWindow = ({
  socket,
  currentUser,
  roomId,
  roomName,
  isGroupChat,
  targetUserId,
  contacts = [],
  onAddContact,
  onBack,
  conversationMeta,
}) => {
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(() => !Boolean(localStorage.getItem(`chat_history_${roomId}`)));
  const [hasLoadedRoom, setHasLoadedRoom] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [usersToInvite, setUsersToInvite] = useState([]);
  const [senderInfo, setSenderInfo] = useState(null);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [contactAdded, setContactAdded] = useState(false);

  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);

  const otherPersonInContacts = !isGroupChat && targetUserId
    ? contacts.some((contact) => normalizeId(contact.id) === normalizeId(targetUserId))
    : true;

  useEffect(() => {
    setSenderInfo(null);
    setContactAdded(false);
  }, [roomId]);

  useEffect(() => {
    if (!socket || !roomId) return undefined;

    setHasMore(false);
    setIsOffline(false);
    setIsLoadingMore(false);
    setTypingUsers([]);
    setHasLoadedRoom(false);
    shouldStickToBottomRef.current = true;

    const cached = localStorage.getItem(`chat_history_${roomId}`);
    if (cached) {
      try {
        setMessages(JSON.parse(cached));
        setIsInitialLoading(false);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
      } catch (error) {
        console.error('Failed to parse cached messages', error);
        setIsInitialLoading(true);
      }
    } else {
      setMessages([]);
      setIsInitialLoading(true);
    }

    const fetchHistory = async () => {
      try {
        const response = await fetch(`${API_URL}/api/messages/${roomId}?limit=50&skip=0`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const historyData = (data.messages || []).map((message) => ({
          ...message,
          _optimistic: false,
          _animate: false,
        }));

        setMessages(historyData);
        setHasMore(data.hasMore || false);
        setIsOffline(false);
        localStorage.setItem(`chat_history_${roomId}`, JSON.stringify(historyData.slice(-50)));
        socket.emit('messages_read', { roomId, readerId: currentUser.id });

        if (!isGroupChat && historyData.length > 0) {
          const otherMessage = historyData.find(
            (message) => normalizeId(message.senderId) !== normalizeId(currentUser.id),
          );
          if (otherMessage) {
            setSenderInfo({ id: otherMessage.senderId, username: otherMessage.senderName });
          }
        }
      } catch (error) {
        console.error('Failed to load chat history', error);
        setIsOffline(true);
      } finally {
        setIsInitialLoading(false);
        setHasLoadedRoom(true);
      }
    };

    fetchHistory();
    socket.emit('join_room', roomId);

    const clearAnimationFlag = (messageId) => {
      window.setTimeout(() => {
        setMessages((prev) =>
          prev.map((message) =>
            String(message.id) === String(messageId) ? { ...message, _animate: false } : message,
          ),
        );
      }, 280);
    };

    const messageHandler = (data) => {
      setMessages((prev) => {
        const incoming = {
          ...data,
          _optimistic: false,
          _animate: true,
        };

        if (normalizeId(data.senderId) === normalizeId(currentUser.id) && data.clientTempId) {
          const matched = prev.find(
            (message) => message.clientTempId && message.clientTempId === data.clientTempId,
          );
          if (matched) {
            clearAnimationFlag(data.id);
            return prev.map((message) =>
              message.clientTempId === data.clientTempId ? { ...incoming, clientTempId: undefined } : message,
            );
          }
        }

        if (prev.some((message) => String(message.id) === String(data.id))) {
          return prev;
        }

        clearAnimationFlag(data.id);
        return [...prev, incoming];
      });

      if (normalizeId(data.senderId) !== normalizeId(currentUser.id)) {
        socket.emit('messages_read', { roomId, readerId: currentUser.id });
        if (!isGroupChat && !senderInfo) {
          setSenderInfo({ id: data.senderId, username: data.senderName });
        }
      }
    };

    const readStatusHandler = (data) => {
      if (data.roomId === roomId && normalizeId(data.readerId) !== normalizeId(currentUser.id)) {
        setMessages((prev) =>
          prev.map((message) =>
            normalizeId(message.senderId) === normalizeId(currentUser.id)
              ? { ...message, isRead: true, _optimistic: false }
              : message,
          ),
        );
      }
    };

    const typingHandler = (data) => {
      if (data.roomId === roomId && data.username !== currentUser.username) {
        setTypingUsers((prev) => (prev.includes(data.username) ? prev : [...prev, data.username]));
      }
    };

    const stopTypingHandler = (data) => {
      if (data.roomId === roomId) {
        setTypingUsers((prev) => prev.filter((user) => user !== data.username));
      }
    };

    socket.on('receive_message', messageHandler);
    socket.on('read_status_updated', readStatusHandler);
    socket.on('user_typing', typingHandler);
    socket.on('user_stop_typing', stopTypingHandler);

    return () => {
      socket.off('receive_message', messageHandler);
      socket.off('read_status_updated', readStatusHandler);
      socket.off('user_typing', typingHandler);
      socket.off('user_stop_typing', stopTypingHandler);
    };
  }, [currentUser.id, currentUser.username, isGroupChat, roomId, senderInfo, socket]);

  useEffect(() => {
    if (isLoadingMore || !shouldStickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoadingMore]);

  useEffect(() => {
    if (messages.length > 0 && roomId) {
      const latestMessages = messages.slice(-50);
      localStorage.setItem(`chat_history_${roomId}`, JSON.stringify(latestMessages));
    }
  }, [messages, roomId]);

  const handleScroll = async (event) => {
    const container = event.target;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 120;

    if (container.scrollTop !== 0 || !hasMore || isLoadingMore || isOffline) return;

    setIsLoadingMore(true);
    const previousScrollHeight = container.scrollHeight;

    try {
      const skip = messages.length;
      const response = await fetch(`${API_URL}/api/messages/${roomId}?limit=50&skip=${skip}`);
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      if (data.messages?.length > 0) {
        const olderMessages = data.messages.map((message) => ({
          ...message,
          _optimistic: false,
          _animate: false,
        }));
        setMessages((prev) => [...olderMessages, ...prev]);
        setHasMore(data.hasMore);

        setTimeout(() => {
          container.scrollTop = container.scrollHeight - previousScrollHeight;
          shouldStickToBottomRef.current = false;
          setIsLoadingMore(false);
        }, 0);
        return;
      }

      setHasMore(false);
    } catch (error) {
      console.error('Error fetching older messages', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleTyping = (event) => {
    setCurrentMessage(event.target.value);
    socket.emit('typing', { roomId, username: currentUser.username });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing', { roomId, username: currentUser.username });
    }, 2000);
  };

  const handleSend = (event) => {
    event.preventDefault();
    const trimmedMessage = currentMessage.trim();
    if (!trimmedMessage) return;
    shouldStickToBottomRef.current = true;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('stop_typing', { roomId, username: currentUser.username });

    const clientTempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: clientTempId,
      clientTempId,
      roomId,
      senderId: currentUser.id,
      senderName: currentUser.username,
      content: trimmedMessage,
      timestamp: new Date().toISOString(),
      isRead: false,
      _optimistic: true,
      _animate: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    window.setTimeout(() => {
      setMessages((prev) =>
        prev.map((message) =>
          message.clientTempId === clientTempId ? { ...message, _animate: false } : message,
        ),
      );
    }, 280);

    socket.emit('send_message', {
      roomId,
      senderId: currentUser.id,
      senderName: currentUser.username,
      content: trimmedMessage,
      timestamp: optimisticMessage.timestamp,
      clientTempId,
    });

    setCurrentMessage('');
  };

  const handleAddSenderToContacts = async () => {
    if (!senderInfo && !targetUserId) return;
    setIsAddingContact(true);
    try {
      const usersResponse = await fetch(`${API_URL}/api/users`);
      const allUsers = await usersResponse.json();
      const otherUser = allUsers.find(
        (user) =>
          normalizeId(user.id) === normalizeId(senderInfo?.id || targetUserId),
      );
      if (!otherUser) {
        alert('Could not find user details');
        return;
      }

      await onAddContact(otherUser);
      setContactAdded(true);
    } catch (error) {
      console.error(error);
      alert('Failed to add contact');
    } finally {
      setIsAddingContact(false);
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      const usersResponse = await fetch(`${API_URL}/api/users`);
      const allUsers = await usersResponse.json();
      const membersResponse = await fetch(`${API_URL}/api/rooms/${roomId}/members`);
      const members = await membersResponse.json();
      const memberIds = members.map((member) => normalizeId(member.id));
      const filtered = allUsers.filter(
        (user) => !memberIds.includes(normalizeId(user.id)) && normalizeId(user.id) !== normalizeId(currentUser.id),
      );
      setUsersToInvite(filtered);
      setShowInviteModal(true);
    } catch (error) {
      console.error('Error fetching users for invite', error);
    }
  };

  const handleAddMember = async (memberId) => {
    try {
      const response = await fetch(`${API_URL}/api/rooms/add-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: roomId, userId: memberId }),
      });
      if (response.ok) {
        setUsersToInvite((prev) => prev.filter((user) => normalizeId(user.id) !== normalizeId(memberId)));
        alert('Teammate added to the group.');
      }
    } catch (error) {
      console.error('Error adding member', error);
    }
  };

  const handleDeleteRoom = async () => {
    if (!window.confirm('Delete this conversation permanently? This cannot be undone.')) return;
    try {
      const response = await fetch(`${API_URL}/api/rooms/${roomId}`, { method: 'DELETE' });
      if (response.ok) {
        window.location.reload();
      } else {
        alert('Cannot delete this system room.');
      }
    } catch (error) {
      console.error('Error deleting room', error);
    }
  };

  const showAddToBanner =
    !isGroupChat &&
    !contactAdded &&
    !otherPersonInContacts &&
    senderInfo != null &&
    normalizeId(senderInfo.id) !== normalizeId(currentUser.id);

  const messageRows = useMemo(() => {
    return messages.map((message, index) => {
      const previous = messages[index - 1];
      const next = messages[index + 1];
      const own = normalizeId(message.senderId) === normalizeId(currentUser.id);
      const previousSameSender =
        previous &&
        normalizeId(previous.senderId) === normalizeId(message.senderId) &&
        formatDateLabel(previous.timestamp) === formatDateLabel(message.timestamp);
      const nextSameSender =
        next &&
        normalizeId(next.senderId) === normalizeId(message.senderId) &&
        formatDateLabel(next.timestamp) === formatDateLabel(message.timestamp);

      return {
        ...message,
        own,
        showDate: !previous || formatDateLabel(previous.timestamp) !== formatDateLabel(message.timestamp),
        showName: isGroupChat && !own && !previousSameSender,
        groupedStart: !previousSameSender,
        groupedEnd: !nextSameSender,
      };
    });
  }, [currentUser.id, isGroupChat, messages]);

  return (
    <div className="relative flex h-full flex-col px-3 py-3 md:px-4 md:py-4">
      <div className="glass-panel relative flex h-full flex-col overflow-hidden rounded-[36px]">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/60 bg-white/55 px-4 py-4 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/45 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-slate-500 shadow-sm transition hover:text-slate-900 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:text-white md:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="relative shrink-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-sm font-semibold uppercase text-white shadow-lg shadow-slate-950/10">
                {(roomName || roomId).slice(0, 1)}
              </div>
              {!isGroupChat && (
                <span
                  className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-950 ${
                    conversationMeta?.onlineStatus ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-slate-900 dark:text-white">{roomName || roomId}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {isGroupChat ? 'Group conversation' : conversationMeta?.onlineStatus ? 'Online now' : 'Direct conversation'}
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            {isGroupChat && roomId !== 'Global Lounge' && (
              <button
                type="button"
                onClick={fetchAvailableUsers}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 text-slate-500 shadow-sm transition hover:text-sky-600 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:text-sky-300"
                title="Add members"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 text-slate-500 shadow-sm transition hover:text-sky-600 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:text-sky-300"
              title="Voice call"
            >
              <Phone className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 text-slate-500 shadow-sm transition hover:text-sky-600 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:text-sky-300"
              title="Video call"
            >
              <Video className="h-4 w-4" />
            </button>
            {roomId !== 'Global Lounge' && (
              <button
                type="button"
                onClick={handleDeleteRoom}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 text-slate-500 shadow-sm transition hover:text-red-500 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:text-red-300"
                title="Delete conversation"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {showAddToBanner && (
          <div className="mx-4 mt-4 rounded-[26px] border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-800 shadow-sm shadow-amber-950/5 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200 md:mx-6">
            <div className="flex items-center justify-between gap-3">
              <p>
                <span className="font-semibold">{senderInfo.username}</span> is not in your contacts yet.
              </p>
              <button
                type="button"
                onClick={handleAddSenderToContacts}
                disabled={isAddingContact}
                className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
              >
                {isAddingContact ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        )}

        {contactAdded && !isGroupChat && (
          <div className="mx-4 mt-4 rounded-[26px] border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700 shadow-sm shadow-emerald-950/5 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200 md:mx-6">
            Added to your contacts.
          </div>
        )}

        {isOffline && (
          <div className="mx-4 mt-4 rounded-[26px] border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm shadow-red-950/5 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200 md:mx-6">
            You are offline. Cached messages are still available.
          </div>
        )}

        <div className="relative flex-1">
          {isInitialLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-white/72 backdrop-blur-2xl dark:bg-slate-950/72">
              <div className="flex h-16 w-16 items-center justify-center rounded-[28px] bg-white/85 shadow-lg shadow-slate-950/10 dark:bg-slate-900/85">
                <div className="h-8 w-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
              </div>
              <div className="space-y-2 text-center">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Loading conversation</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pulling in messages for this room...
                </p>
              </div>
            </div>
          )}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="chat-scroll h-full overflow-y-auto px-4 py-6 md:px-6"
          >
          {isLoadingMore && (
            <div className="mb-3 flex justify-center">
              <div className="h-6 w-6 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
            </div>
          )}

          {messageRows.length === 0 && !isLoadingMore && !isInitialLoading && hasLoadedRoom && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-white/80 shadow-lg shadow-slate-950/5 dark:bg-slate-900/70">
                <MoreHorizontal className="h-8 w-8 text-slate-400" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">No messages yet</p>
              <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
                Start the conversation with a clean, modern thread designed for light and dark mode.
              </p>
            </div>
          )}

          <div className="space-y-1">
            {messageRows.map((message) => (
              <React.Fragment key={message.id}>
                {message.showDate && (
                  <div className="sticky top-4 z-10 flex justify-center py-3">
                    <span className="rounded-full border border-white/60 bg-white/75 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/75 dark:text-slate-300">
                      {formatDateLabel(message.timestamp)}
                    </span>
                  </div>
                )}

                <div className={`flex ${message.own ? 'justify-end' : 'justify-start'} ${message.groupedStart ? 'mt-3' : 'mt-1'}`}>
                  <div className={`max-w-[85%] sm:max-w-[72%] ${message.own ? 'items-end' : 'items-start'} flex flex-col`}>
                    {message.showName && (
                      <span className="mb-1.5 pl-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        {message.senderName}
                      </span>
                    )}

                    <div
                      className={`relative transition ${message._animate ? 'message-pop' : ''} ${
                        message.own
                          ? 'rounded-[18px] bg-[#0b8f72] text-white shadow-sm'
                          : 'rounded-[18px] border border-white/70 bg-white text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-100'
                      } ${
                        message.groupedStart
                          ? message.own
                            ? 'rounded-br-md'
                            : 'rounded-bl-md'
                        : message.own
                            ? 'rounded-br-[18px]'
                            : 'rounded-bl-[18px]'
                      } max-w-full px-4 py-2.5`}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                      <div
                        className={`mt-1.5 flex items-center gap-1 text-[11px] ${
                          message.own ? 'justify-end text-white/75' : 'justify-end text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        <span className="leading-none">{formatMessageTime(message.timestamp)}</span>
                        {message.own && <StatusIcon message={message} />}
                      </div>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            ))}

            {typingUsers.length > 0 && (
              <div className="mt-3 flex justify-start">
                <div className="rounded-[20px] rounded-bl-md border border-white/70 bg-white px-4 py-3 text-sm text-slate-600 shadow-lg shadow-slate-950/5 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <span>{typingUsers.join(', ')} typing</span>
                    <div className="flex items-center gap-1">
                      <span className="typing-dot" />
                      <span className="typing-dot [animation-delay:120ms]" />
                      <span className="typing-dot [animation-delay:240ms]" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-white/60 bg-white/35 px-4 py-4 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/30 md:px-6">
          <form
            onSubmit={handleSend}
            className="glass-panel flex items-center gap-3 rounded-[28px] px-3 py-2"
          >
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 text-slate-500 shadow-sm transition hover:text-sky-600 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:text-sky-300"
              title="Attach media"
            >
              <ImagePlus className="h-4 w-4" />
            </button>

            <input
              type="text"
              value={currentMessage}
              onChange={handleTyping}
              placeholder="Message"
              className="flex-1 bg-transparent px-1 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
            />

            <button
              type="submit"
              disabled={!currentMessage.trim()}
              className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
            >
              Send
            </button>
          </form>
        </div>

        {showInviteModal && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[32px] border border-white/60 bg-white/90 p-5 shadow-2xl shadow-slate-950/15 dark:border-white/10 dark:bg-slate-950/90">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                    Group members
                  </p>
                  <h4 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">Invite people</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:text-slate-900 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {usersToInvite.length === 0 ? (
                  <div className="rounded-[24px] bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    Everyone is already in this group.
                  </div>
                ) : (
                  usersToInvite.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between gap-3 rounded-[24px] bg-slate-50 px-3 py-3 dark:bg-slate-900"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {user.username}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddMember(user.id)}
                        className="rounded-full bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-600"
                      >
                        Add
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatWindow;
