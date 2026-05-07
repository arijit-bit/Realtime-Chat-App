import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Bell,
  CirclePlus,
  ContactRound,
  MessageSquare,
  Moon,
  Phone,
  Search,
  Settings,
  Sparkles,
  SunMedium,
  Users,
  X,
} from 'lucide-react';
import ChatWindow from '../components/ChatWindow';
import { API_URL } from '../config';

const desktopSections = [
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'contacts', label: 'Contacts', icon: ContactRound },
  { id: 'calls', label: 'Calls', icon: Phone },
];

const mobileSections = [
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'calls', label: 'Calls', icon: Phone },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const formatConversationTime = (value) => {
  if (!value) return '';

  const date = new Date(value);
  const now = new Date();
  const isSameDay = date.toDateString() === now.toDateString();

  if (isSameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const CACHE_TTL_MS = 15 * 60 * 1000;

const readSessionCache = (key) => {
  try {
    const rawValue = sessionStorage.getItem(key);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch (error) {
    console.error(error);
    sessionStorage.removeItem(key);
    return null;
  }
};

const writeSessionCache = (key, value) => {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        value,
        expiresAt: Date.now() + CACHE_TTL_MS,
      }),
    );
  } catch (error) {
    console.error(error);
  }
};

const Avatar = ({ name, isGroup = false, online = false, tone = 'teal' }) => {
  const classes =
    tone === 'emerald'
      ? 'from-emerald-500 to-teal-500'
      : tone === 'sky'
        ? 'from-sky-500 to-cyan-500'
        : 'from-slate-500 to-slate-700';

  return (
    <div className="relative shrink-0">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${classes} text-sm font-semibold uppercase text-white shadow-lg shadow-slate-950/10`}
      >
        {isGroup ? <Users className="h-5 w-5" /> : (name || '?').slice(0, 1)}
      </div>
      {!isGroup && (
        <span
          className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-950 ${
            online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        />
      )}
    </div>
  );
};

const DesktopNavButton = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    className={`group relative flex h-11 w-11 items-center justify-center rounded-xl border transition ${
      active
        ? 'border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-slate-800 dark:text-white'
        : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:border-white/10 dark:hover:bg-slate-800/70 dark:hover:text-white'
    }`}
  >
    {active && (
      <span className="absolute -left-5 h-7 w-1 rounded-full bg-slate-900 dark:bg-white" />
    )}
    <Icon className="h-5 w-5" />
    <span className="pointer-events-none absolute left-[calc(100%+12px)] z-50 hidden whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg group-hover:block dark:bg-white dark:text-slate-900">
      {label}
    </span>
  </button>
);

const MobileNavButton = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-medium transition ${
      active
        ? 'bg-white text-sky-600 shadow-sm dark:bg-slate-800 dark:text-sky-300'
        : 'text-slate-500 dark:text-slate-400'
    }`}
  >
    <Icon className="h-5 w-5" />
    <span>{label}</span>
  </button>
);

const SettingRow = ({ label, hint, action }) => (
  <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-sm shadow-slate-950/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60">
    <div>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
    {action}
  </div>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeSection, setActiveSection] = useState('chats');
  const [mobileSection, setMobileSection] = useState('chats');
  const [conversationFilter, setConversationFilter] = useState('direct');
  const [activeRoom, setActiveRoom] = useState('Global Lounge');
  const [conversations, setConversations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState([]);
  const [savedContactResults, setSavedContactResults] = useState([]);
  const [unknownUserResult, setUnknownUserResult] = useState(null);
  const [contactSearchError, setContactSearchError] = useState('');
  const [isSearchingContact, setIsSearchingContact] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [usersForModal, setUsersForModal] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const activeRoomRef = useRef(activeRoom);

  const deferredSearch = useDeferredValue(searchTerm.trim().toLowerCase());

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    const totalUnread = conversations.reduce((acc, conv) => acc + (conv.unreadCount || 0), 0);
    document.title = totalUnread > 0 ? `(${totalUnread}) NeoChat` : 'NeoChat';
  }, [conversations]);

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('userInfo');
    if (!storedUser) {
      navigate('/login');
      return;
    }

    const parsedUser = JSON.parse(storedUser);
    setUserInfo(parsedUser);

    const cachedConversations = readSessionCache(`conversations_${parsedUser.id}`);
    if (cachedConversations) {
      setConversations(cachedConversations);
    }

    const cachedContacts = readSessionCache(`contacts_${parsedUser.id}`);
    if (cachedContacts) {
      setContacts(cachedContacts);
    }

    const cachedUsersForModal = readSessionCache('users_for_modal');
    if (cachedUsersForModal) {
      setUsersForModal(cachedUsersForModal);
    }

    const newSocket = io(API_URL, { query: { userId: parsedUser.id } });
    setSocket(newSocket);

    newSocket.on('user_status_changed', (data) => {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.targetUserId === data.userId
            ? { ...conversation, onlineStatus: data.status === 'online' }
            : conversation,
        ),
      );
    });

    newSocket.on('receive_message', (data) => {
      setConversations((prev) => {
        const updated = [...prev];
        const index = updated.findIndex((conversation) => conversation.id === data.roomId);

        if (index > -1) {
          const currentConversation = updated[index];
          updated[index] = {
            ...currentConversation,
            lastMessage: data.content,
            lastMessageTime: data.timestamp,
            unreadCount:
              data.roomId !== activeRoomRef.current && data.senderId !== parsedUser.id
                ? (currentConversation.unreadCount || 0) + 1
                : 0,
          };
          const [moved] = updated.splice(index, 1);
          updated.unshift(moved);
          return updated;
        }

        fetchConversations(parsedUser.id);
        return prev;
      });
    });

    newSocket.on('new_conversation', () => {
      fetchConversations(parsedUser.id);
    });

    fetchConversations(parsedUser.id);
    fetchUsersForModal();
    fetchUserContacts(parsedUser.id);

    return () => newSocket.disconnect();
  }, [navigate]);

  useEffect(() => {
    if (userInfo) {
      writeSessionCache(`conversations_${userInfo.id}`, conversations);
    }
  }, [conversations, userInfo]);

  useEffect(() => {
    if (userInfo) {
      writeSessionCache(`contacts_${userInfo.id}`, contacts);
    }
  }, [contacts, userInfo]);

  useEffect(() => {
    const isContactsView = activeSection === 'contacts' || mobileSection === 'contacts';
    if (!isContactsView || deferredSearch.length === 0 || !userInfo) {
      setSavedContactResults([]);
      setUnknownUserResult(null);
      setContactSearchError('');
      return undefined;
    }

    const timer = setTimeout(async () => {
      setIsSearchingContact(true);
      setSavedContactResults([]);
      setUnknownUserResult(null);
      setContactSearchError('');
      try {
        const response = await fetch(
          `${API_URL}/api/users/search?q=${encodeURIComponent(
            deferredSearch,
          )}&currentUserId=${userInfo.id}`,
        );
        const data = await response.json();

        if (!response.ok) {
          setContactSearchError(data.message || 'Search failed');
          return;
        }

        setSavedContactResults(data.savedContacts || []);
        setUnknownUserResult(data.unknownUser || null);
      } catch (error) {
        console.error(error);
        setContactSearchError('Network error. Check your connection.');
      } finally {
        setIsSearchingContact(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [activeSection, deferredSearch, mobileSection, userInfo]);

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      return next;
    });
  };

  const fetchConversations = async (userId) => {
    try {
      const response = await fetch(`${API_URL}/api/conversations?userId=${userId}`);
      const data = await response.json();
      setConversations(data);
      writeSessionCache(`conversations_${userId}`, data);

      if (!activeRoomRef.current && data.length > 0) {
        setActiveRoom(data[0].id);
        return;
      }

      if (data.length > 0 && !data.some((conversation) => conversation.id === activeRoomRef.current)) {
        setActiveRoom(data[0].id);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchUsersForModal = async () => {
    try {
      const response = await fetch(`${API_URL}/api/users`);
      const data = await response.json();
      setUsersForModal(data);
      writeSessionCache('users_for_modal', data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchUserContacts = async (userId) => {
    try {
      const response = await fetch(`${API_URL}/api/users/${userId}/contacts`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setContacts(data);
        writeSessionCache(`contacts_${userId}`, data);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    }
  };

  const handleAddContact = async (user) => {
    if (!userInfo) return;

    try {
      const response = await fetch(`${API_URL}/api/users/${userInfo.id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactEmail: user.email }),
      });
      const data = await response.json();

      if (!response.ok) {
        alert(data.message || 'Failed to add contact');
        return;
      }

      setContacts((prev) => {
        if (prev.some((contact) => String(contact.id) === String(data.contact.id))) {
          return prev;
        }
        return [...prev, data.contact];
      });
      setUnknownUserResult(null);
      setSearchTerm('');
    } catch (error) {
      console.error(error);
      alert('Network error. Could not add contact.');
    }
  };

  const openConversation = (roomId) => {
    setActiveRoom(roomId);
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === roomId ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    );
    setShowMobileChat(true);
    setActiveSection('chats');
    setMobileSection('chats');
  };

  const handleOpenDirectChat = (contactUser) => {
    const first = userInfo.id;
    const second = contactUser.id;
    const roomName = first < second ? `${first}_${second}` : `${second}_${first}`;
    openConversation(roomName);
  };

  const handleCreateGroup = async (event) => {
    event.preventDefault();

    if (!newRoomName || newRoomName.trim() === '') {
      alert('Please enter a group name.');
      return;
    }

    if (selectedUsers.length === 0) {
      alert('Please select at least one contact to add to the group.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: newRoomName.trim(), members: [...selectedUsers, userInfo.id] }),
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.message || 'Error creating room');
        return;
      }

      setShowGroupModal(false);
      setNewRoomName('');
      setSelectedUsers([]);
      await fetchConversations(userInfo.id);
      openConversation(data.roomName);
      setConversationFilter('groups');
    } catch (error) {
      console.error(error);
    }
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    if (!editUsername.trim()) return;

    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/users/${userInfo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: editUsername.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.message || 'Error updating profile');
        return;
      }

      const updatedUser = { ...userInfo, username: data.username };
      setUserInfo(updatedUser);
      localStorage.setItem('userInfo', JSON.stringify(updatedUser));
      setShowSettingsModal(false);
    } catch (error) {
      console.error(error);
      alert('Failed to connect to server.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('userInfo');
    socket?.disconnect();
    navigate('/login');
  };

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeRoom),
    [activeRoom, conversations],
  );

  const directChats = useMemo(
    () => conversations.filter((conversation) => !conversation.isGroup),
    [conversations],
  );

  const groupChats = useMemo(
    () => conversations.filter((conversation) => conversation.isGroup),
    [conversations],
  );

  const filteredConversations = useMemo(() => {
    const list = conversationFilter === 'groups' ? groupChats : directChats;
    if (!deferredSearch) return list;
    return list.filter((conversation) => conversation.name.toLowerCase().includes(deferredSearch));
  }, [conversationFilter, deferredSearch, directChats, groupChats]);

  const filteredContacts = useMemo(() => {
    if (!deferredSearch) return contacts;
    return contacts.filter(
      (contact) =>
        contact.username.toLowerCase().includes(deferredSearch) ||
        contact.email.toLowerCase().includes(deferredSearch),
    );
  }, [contacts, deferredSearch]);

  const renderConversationItem = (conversation) => {
    const isActive = activeRoom === conversation.id;
    const previewTone = conversation.isGroup ? 'sky' : 'emerald';

    return (
      <button
        key={conversation.id}
        type="button"
        onClick={() => openConversation(conversation.id)}
        className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
          isActive
            ? 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/80'
            : 'border-transparent bg-white/55 hover:border-white/70 hover:bg-white/80 dark:bg-slate-900/35 dark:hover:border-white/10 dark:hover:bg-slate-900/60'
        }`}
      >
        <Avatar
          name={conversation.name}
          isGroup={conversation.isGroup}
          online={conversation.onlineStatus}
          tone={previewTone}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {conversation.name}
            </p>
            <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
              {formatConversationTime(conversation.lastMessageTime)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {conversation.lastMessage}
            </p>
            {conversation.unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white">
                {conversation.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const renderContactItem = (contact, showAdd = false) => (
    <div
      key={contact.id}
      className="flex items-center justify-between gap-3 rounded-2xl border border-transparent bg-white/55 px-3 py-3 shadow-sm shadow-slate-950/5 transition hover:border-white/70 hover:bg-white/80 dark:bg-slate-900/35 dark:hover:border-white/10 dark:hover:bg-slate-900/60"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={contact.username} online={contact.onlineStatus} tone="emerald" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{contact.username}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{contact.email}</p>
        </div>
      </div>
      {showAdd ? (
        <button
          type="button"
          onClick={() => handleAddContact(contact)}
          className="rounded-full bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-600"
        >
          Add
        </button>
      ) : (
        <button
          type="button"
          onClick={() => handleOpenDirectChat(contact)}
          className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-950/5 transition hover:text-sky-600 dark:bg-slate-800 dark:text-slate-200"
        >
          Message
        </button>
      )}
    </div>
  );

  const renderChatsPane = () => (
    <>
      <div className="glass-panel flex items-center justify-between px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            {getGreeting()}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
            {userInfo?.username || 'Workspace'}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowGroupModal(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white transition hover:scale-[1.03]"
          title="New chat or group"
        >
          <CirclePlus className="h-5 w-5" />
        </button>
      </div>

      <div className="glass-panel mt-4 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search messages, people, or groups"
            className="w-full rounded-xl border border-transparent bg-white/80 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-sky-200 focus:bg-white dark:bg-slate-900/70 dark:text-white dark:focus:border-sky-500/20"
          />
        </div>

        <div className="mt-3 flex gap-2">
          {[
            { id: 'direct', label: 'Direct' },
            { id: 'groups', label: 'Groups' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setConversationFilter(item.id)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                conversationFilter === item.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-white/70 text-slate-600 hover:bg-white dark:bg-slate-900/60 dark:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto pr-1">
        <div className="space-y-2.5">
          {filteredConversations.map(renderConversationItem)}
          {filteredConversations.length === 0 && (
            <div className="glass-panel px-5 py-8 text-center">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">No conversations yet</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Start a direct chat or open a new group to begin.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );

  const renderContactsPane = () => (
    <>
      <div className="glass-panel px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
          Contacts
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">People you chat with</h2>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by name or email"
            className="w-full rounded-xl border border-transparent bg-white/80 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-sky-200 focus:bg-white dark:bg-slate-900/70 dark:text-white dark:focus:border-sky-500/20"
          />
        </div>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto pr-1">
        <div className="space-y-3">
          {isSearchingContact && (
            <div className="glass-panel px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              Searching contacts...
            </div>
          )}

          {contactSearchError && (
            <div className="rounded-[28px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              {contactSearchError}
            </div>
          )}

          {unknownUserResult && renderContactItem(unknownUserResult, true)}

          {(deferredSearch ? savedContactResults : filteredContacts).map((contact) => renderContactItem(contact))}

          {!deferredSearch && filteredContacts.length === 0 && (
            <div className="glass-panel px-5 py-8 text-center">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">No contacts yet</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Search by exact email to add someone to your list.
              </p>
            </div>
          )}

          {deferredSearch &&
            !isSearchingContact &&
            savedContactResults.length === 0 &&
            !unknownUserResult &&
            !contactSearchError && (
              <div className="glass-panel px-5 py-8 text-center">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">No matching contacts</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Try an exact email address if you want to add someone new.
                </p>
              </div>
            )}
        </div>
      </div>
    </>
  );

  const renderCallsPane = () => (
    <>
      <div className="glass-panel px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
          Calls
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">Call moments</h2>
      </div>

      <div className="mt-4 space-y-3 overflow-y-auto pr-1">
        {[
          { title: 'Voice calls', body: 'Voice and video actions are ready for a future backend pass.' },
          { title: 'Design parity', body: 'The layout now reserves a native mobile Calls destination in the navigation.' },
          { title: 'Reusable shell', body: 'This section uses the same glassmorphism treatment so it feels cohesive today.' },
        ].map((card) => (
          <div
            key={card.title}
            className="glass-panel bg-gradient-to-br from-white/85 to-sky-50/85 px-5 py-5 dark:from-slate-900/70 dark:to-slate-900/40"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{card.title}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{card.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  const renderSettingsContent = () => (
    <form onSubmit={handleSaveProfile} className="space-y-4">
      <div className="glass-panel px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
          Settings
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">Profile and appearance</h2>
      </div>

      <div className="glass-panel p-4">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Username
        </label>
        <input
          type="text"
          value={editUsername}
          onChange={(event) => setEditUsername(event.target.value)}
          className="w-full rounded-xl border border-transparent bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-200 focus:bg-white dark:bg-slate-900/70 dark:text-white dark:focus:border-sky-500/20"
        />
      </div>

      <SettingRow
        label="Theme"
        hint="Switch between bright and dim surfaces."
        action={
          <button
            type="button"
            onClick={toggleTheme}
            className={`flex h-10 w-16 items-center rounded-full p-1 transition ${
              isDarkMode ? 'bg-slate-900 dark:bg-sky-500/70' : 'bg-slate-200'
            }`}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow transition ${
                isDarkMode ? 'translate-x-6' : ''
              }`}
            >
              {isDarkMode ? <Moon className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
            </span>
          </button>
        }
      />

      <SettingRow
        label="Notifications"
        hint="Visual shell for future preferences."
        action={
          <div className="rounded-full bg-sky-500/10 p-2 text-sky-600 dark:text-sky-300">
            <Bell className="h-4 w-4" />
          </div>
        }
      />

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSaving || !editUsername.trim()}
          className="flex-1 rounded-[20px] bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
        >
          {isSaving ? 'Saving...' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
        >
          Sign out
        </button>
      </div>
    </form>
  );

  const renderSidebarPane = () => {
    if (activeSection === 'contacts' || mobileSection === 'contacts') return renderContactsPane();
    if (activeSection === 'calls' || mobileSection === 'calls') return renderCallsPane();
    if (mobileSection === 'settings') return renderSettingsContent();
    return renderChatsPane();
  };

  if (!userInfo || !socket) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-300">
        Connecting...
      </div>
    );
  }

  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.18),_transparent_28%),linear-gradient(180deg,_#f4fbff_0%,_#eef4f8_100%)] text-slate-900 transition-colors duration-500 dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.24),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.14),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] dark:text-slate-100">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:24px_24px] opacity-40 dark:opacity-15" />

      <aside className="relative z-20 hidden w-24 shrink-0 flex-col items-center justify-between overflow-visible border-r border-white/50 px-4 py-6 backdrop-blur-xl dark:border-white/10 md:flex">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
            <Sparkles className="h-6 w-6" />
          </div>
          {desktopSections.map((section) => (
            <DesktopNavButton
              key={section.id}
              active={activeSection === section.id}
              icon={section.icon}
              label={section.label}
              onClick={() => {
                setActiveSection(section.id);
                setMobileSection(section.id === 'calls' ? 'calls' : 'chats');
                setSearchTerm('');
              }}
            />
          ))}
        </div>

        <div className="flex flex-col items-center gap-4">
          <DesktopNavButton
            active={false}
            icon={isDarkMode ? SunMedium : Moon}
            label="Theme"
            onClick={toggleTheme}
          />
          <DesktopNavButton
            active={false}
            icon={CirclePlus}
            label="New Group"
            onClick={() => setShowGroupModal(true)}
          />
          <button
            type="button"
            onClick={() => {
              setEditUsername(userInfo.username);
              setShowSettingsModal(true);
            }}
            className="group flex h-12 w-12 items-center justify-center rounded-xl bg-white/80 text-slate-900 shadow-lg shadow-slate-950/5 transition hover:bg-white dark:bg-slate-900/70 dark:text-white"
          >
            <span className="text-base font-semibold uppercase">{userInfo.username?.slice(0, 1)}</span>
          </button>
        </div>
      </aside>

      <div
        className={`relative z-10 w-full shrink-0 flex-col border-r border-white/50 px-4 py-4 backdrop-blur-xl dark:border-white/10 md:flex md:w-[360px] xl:w-[400px] ${
          mobileSection === 'chats' && showMobileChat ? 'hidden md:flex' : 'flex'
        }`}
      >
        {renderSidebarPane()}
      </div>

      <main
        className={`relative z-10 min-w-0 flex-1 flex-col ${
          mobileSection !== 'chats' ? 'hidden md:flex' : showMobileChat ? 'flex' : 'hidden md:flex'
        }`}
      >
        <ChatWindow
          key={activeRoom}
          socket={socket}
          currentUser={userInfo}
          roomId={activeRoom}
          roomName={activeConversation?.name || activeRoom}
          isGroupChat={activeConversation?.isGroup}
          targetUserId={activeConversation?.targetUserId}
          contacts={contacts}
          onAddContact={handleAddContact}
          onBack={() => setShowMobileChat(false)}
          conversationMeta={activeConversation}
        />
      </main>

      {!showMobileChat && (
        <div className="absolute inset-x-4 bottom-4 z-20 md:hidden">
          <div className="glass-panel flex items-center gap-2 p-2">
            {mobileSections.map((section) => (
              <MobileNavButton
                key={section.id}
                active={mobileSection === section.id}
                icon={section.icon}
                label={section.label}
                onClick={() => {
                  setMobileSection(section.id);
                  if (section.id === 'chats') {
                    setActiveSection('chats');
                  }
                  if (section.id === 'calls') {
                    setActiveSection('calls');
                  }
                  if (section.id === 'settings') {
                    setEditUsername(userInfo.username);
                  }
                  setSearchTerm('');
                }}
              />
            ))}
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.8))] p-5 shadow-2xl shadow-slate-950/15 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.82))]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Preferences
                </p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">Profile settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 text-slate-500 transition hover:text-slate-900 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderSettingsContent()}
          </div>
        </div>
      )}

      {showGroupModal && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,255,255,0.82))] p-5 shadow-2xl shadow-slate-950/15 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(15,23,42,0.82))]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  New thread
                </p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">Create group or direct chat</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 text-slate-500 transition hover:text-slate-900 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Group name
                  <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  required
                  type="text"
                  value={newRoomName}
                  onChange={(event) => setNewRoomName(event.target.value)}
                  placeholder="e.g. Team Alpha, Weekend Plans…"
                  className="w-full rounded-xl border border-transparent bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-200 focus:bg-white dark:bg-slate-900/70 dark:text-white dark:focus:border-sky-500/20"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Members — your contacts
                </label>
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-white/60 bg-white/60 p-2 dark:border-white/10 dark:bg-slate-900/50">
                  {contacts.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                      No contacts yet. Add people from the Contacts tab first.
                    </div>
                  ) : (
                    contacts.map((user) => {
                      const selected = selectedUsers.includes(user.id);
                      return (
                        <label
                          key={user.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 transition ${
                            selected
                              ? 'bg-sky-500/10 ring-1 ring-sky-500/20'
                              : 'bg-transparent hover:bg-white/70 dark:hover:bg-slate-900/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              setSelectedUsers((prev) =>
                                prev.includes(user.id)
                                  ? prev.filter((item) => item !== user.id)
                                  : [...prev, user.id],
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
                          />
                          <Avatar name={user.username} online={user.onlineStatus} tone="emerald" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                              {user.username}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="flex-1 rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white dark:bg-slate-900/70 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                >
                  Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
