import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import ChatWindow from '../components/ChatWindow';
import { API_URL } from '../config';

// ── Icons ──────────────────────────────────────────────────────────────────
const SearchIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);
const MoreIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
    </svg>
);
const PlusIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
);

let currentNightNote = null;

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good Morning!';
    if (hour >= 12 && hour < 17) return 'Good Afternoon!';
    if (hour >= 17 && hour < 22) return 'Good Evening!';
    
    // 10 PM to 5 AM (Night owl mode)
    if (!currentNightNote) {
        const nightNotes = [
            "Up late, huh? 🌙",
            "Burning the midnight oil? 🕯️",
            "Night owl mode activated 🦉",
            "Still awake? 🌌",
            "Quiet hours 🌙",
            "Late night chats? 🤫"
        ];
        currentNightNote = nightNotes[Math.floor(Math.random() * nightNotes.length)];
    }
    return currentNightNote;
};

const Dashboard = () => {
    const navigate = useNavigate();
    const [userInfo, setUserInfo] = useState(null);
    const [socket, setSocket] = useState(null);
    const [isDarkMode, setIsDarkMode] = useState(false);

    // Tabs: 'chats' | 'groups' | 'contacts'
    const [activeTab, setActiveTab] = useState('chats');

    const [activeRoom, setActiveRoom] = useState('Global Lounge');
    const [conversations, setConversations] = useState([]);

    // Search
    const [searchTerm, setSearchTerm] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    // Contacts tab state — stored in DB, NOT localStorage
    const [contacts, setContacts] = useState([]);
    const [contactEmailInput, setContactEmailInput] = useState('');
    // savedContactResults: contacts from user's list that match the search
    const [savedContactResults, setSavedContactResults] = useState([]);
    // unknownUserResult: an exact-email match that is NOT in the user's contacts yet
    const [unknownUserResult, setUnknownUserResult] = useState(null);
    const [contactSearchError, setContactSearchError] = useState('');
    const [isSearchingContact, setIsSearchingContact] = useState(false);

    // Group creation modal
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [usersForModal, setUsersForModal] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState([]);

    // Settings modal
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [editUsername, setEditUsername] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [showMobileChat, setShowMobileChat] = useState(false);

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

    const toggleTheme = () => {
        setIsDarkMode(prev => {
            const next = !prev;
            if (next) { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark'); }
            else { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light'); }
            return next;
        });
    };

    useEffect(() => {
        const storedUser = localStorage.getItem('userInfo');
        if (!storedUser) { navigate('/login'); return; }

        const parsedUser = JSON.parse(storedUser);
        setUserInfo(parsedUser);

        const newSocket = io(API_URL, { query: { userId: parsedUser.id } });
        setSocket(newSocket);

        newSocket.on('user_status_changed', (data) => {
            setConversations(prev => prev.map(c =>
                c.targetUserId === data.userId ? { ...c, onlineStatus: data.status === 'online' } : c
            ));
        });

        newSocket.on('receive_message', (data) => {
            setConversations(prev => {
                let updated = [...prev];
                const idx = updated.findIndex(c => c.id === data.roomId);
                if (idx > -1) {
                    // Known room — update last message + unread count
                    const c = updated[idx];
                    updated[idx] = { ...c, lastMessage: data.content, unreadCount: c.id !== activeRoom ? c.unreadCount + 1 : c.unreadCount };
                    const item = updated.splice(idx, 1)[0];
                    updated.unshift(item);
                } else {
                    // Unknown room (first message in a new DM) — refetch sidebar
                    fetchConversations(parsedUser.id);
                }
                return updated;
            });
        });

        // Fired by the server to the recipient when a new conversation starts
        // (e.g. someone messages you for the first time, or a group message arrives
        // before you've joined that socket room)
        newSocket.on('new_conversation', () => {
            fetchConversations(parsedUser.id);
        });

        fetchConversations(parsedUser.id);
        fetchUsersForModal();
        fetchUserContacts(parsedUser.id);

        return () => newSocket.disconnect();
    }, [navigate, activeRoom]);

    const fetchConversations = async (userId) => {
        try {
            const res = await fetch(`${API_URL}/api/conversations?userId=${userId}`);
            const data = await res.json();
            setConversations(data);
        } catch (err) { console.error(err); }
    };

    const fetchUsersForModal = async () => {
        try {
            const res = await fetch(`${API_URL}/api/users`);
            const data = await res.json();
            setUsersForModal(data);
        } catch (err) { console.error(err); }
    };

    const fetchUserContacts = async (userId) => {
        try {
            const res = await fetch(`${API_URL}/api/users/${userId}/contacts`);
            const data = await res.json();
            if (Array.isArray(data)) setContacts(data);
        } catch (err) { console.error('Error fetching contacts:', err); }
    };

    useEffect(() => {
        if (activeTab === 'contacts' && searchTerm.trim().length > 0 && userInfo) {
            const delayDebounceFn = setTimeout(async () => {
                setIsSearchingContact(true);
                setSavedContactResults([]);
                setUnknownUserResult(null);
                setContactSearchError('');
                try {
                    const res = await fetch(
                        `${API_URL}/api/users/search?q=${encodeURIComponent(searchTerm.trim())}&currentUserId=${userInfo.id}`
                    );
                    const data = await res.json();
                    if (res.ok) {
                        setSavedContactResults(data.savedContacts || []);
                        setUnknownUserResult(data.unknownUser || null);
                    } else {
                        setContactSearchError(data.message || 'Search failed');
                    }
                } catch {
                    setContactSearchError('Network error. Check your connection.');
                } finally {
                    setIsSearchingContact(false);
                }
            }, 500);
            return () => clearTimeout(delayDebounceFn);
        } else {
            setSavedContactResults([]);
            setUnknownUserResult(null);
            setContactSearchError('');
        }
    }, [searchTerm, activeTab, userInfo]);

    const handleAddContact = async (user) => {
        if (!userInfo) return;
        try {
            const res = await fetch(`${API_URL}/api/users/${userInfo.id}/contacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contactEmail: user.email })
            });
            const data = await res.json();
            if (res.ok) {
                // Add to local contacts list
                setContacts(prev => [...prev, data.contact]);
                setUnknownUserResult(null);
                setSearchTerm('');
            } else {
                alert(data.message || 'Failed to add contact');
            }
        } catch {
            alert('Network error. Could not add contact.');
        }
    };

    const handleOpenDirectChat = (contactUser) => {
        const p1 = userInfo.id;
        const p2 = contactUser.id;
        const roomName = p1 < p2 ? `${p1}_${p2}` : `${p2}_${p1}`;
        setActiveRoom(roomName);
        setActiveTab('chats');
        setShowMobileChat(true);
    };

    // ── Group creation ──────────────────────────────────────────────────────
    const handleCreateGroup = async (e) => {
        e.preventDefault();
        if ((!newRoomName || newRoomName.trim() === '') && selectedUsers.length === 1) {
            const targetUserId = selectedUsers[0];
            const p1 = userInfo.id, p2 = targetUserId;
            const oneOnOneRoomName = p1 < p2 ? `${p1}_${p2}` : `${p2}_${p1}`;
            setShowGroupModal(false); setSelectedUsers([]); setActiveRoom(oneOnOneRoomName); setShowMobileChat(true); return;
        }
        if (!newRoomName || newRoomName.trim() === '') {
            alert('Provide a group name or select exactly ONE user.'); return;
        }
        try {
            const res = await fetch(`${API_URL}/api/rooms/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName: newRoomName.trim(), members: [...selectedUsers, userInfo.id] })
            });
            const data = await res.json();
            if (res.ok) {
                setShowGroupModal(false); setNewRoomName(''); setSelectedUsers([]);
                await fetchConversations(userInfo.id);
                setActiveRoom(data.roomName);
                setActiveTab('groups');
                setShowMobileChat(true);
            } else { alert(data.message || 'Error creating room'); }
        } catch (err) { console.error(err); }
    };

    // ── Settings ────────────────────────────────────────────────────────────
    const openSettings = () => { setEditUsername(userInfo.username); setShowSettingsModal(true); setShowMoreMenu(false); };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        if (!editUsername.trim()) return;
        setIsSaving(true);
        try {
            const res = await fetch(`${API_URL}/api/users/${userInfo.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: editUsername.trim() })
            });
            const data = await res.json();
            if (res.ok) {
                const updatedUser = { ...userInfo, username: data.username };
                setUserInfo(updatedUser);
                localStorage.setItem('userInfo', JSON.stringify(updatedUser));
                setShowSettingsModal(false);
            } else { alert(data.message || 'Error updating profile'); }
        } catch { alert('Failed to connect to server.'); }
        finally { setIsSaving(false); }
    };

    if (!userInfo || !socket) {
        return <div className="flex items-center justify-center h-screen text-slate-400">Connecting...</div>;
    }

    // Partition conversations
    const directChats = conversations.filter(c => !c.isGroup);
    const groupRooms = conversations.filter(c => c.isGroup);

    const filteredList = (() => {
        const term = searchTerm.toLowerCase();
        if (activeTab === 'chats') return directChats.filter(c => c.name.toLowerCase().includes(term));
        if (activeTab === 'groups') return groupRooms.filter(c => c.name.toLowerCase().includes(term));
        return [];
    })();

    const renderConvItem = (conv) => {
        const isActive = activeRoom === conv.id;
        return (
            <div
                key={conv.id}
                onClick={() => { setActiveRoom(conv.id); setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c)); setShowMobileChat(true); }}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all border-l-[3px] ${isActive ? 'bg-blue-50/50 dark:bg-slate-800/80 border-[#0078fe]' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
            >
                <div className="relative shrink-0">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm ${conv.isGroup ? 'bg-[#0078fe]' : 'bg-slate-400 dark:bg-slate-600'}`}>
                        {conv.isGroup ? '#' : conv.name.charAt(0).toUpperCase()}
                    </div>
                    {!conv.isGroup && (
                        <span className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1e293b] ${conv.onlineStatus ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between">
                        <h3 className={`font-semibold truncate text-[15px] ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-200'}`}>{conv.name}</h3>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0 ml-2">
                            {conv.lastMessageTime && new Date(conv.lastMessageTime).getHours() > 0
                                ? new Date(conv.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                        <p className={`text-[13px] truncate pr-2 text-slate-500 dark:text-slate-400 ${conv.unreadCount > 0 ? 'font-semibold text-slate-700 dark:text-slate-200' : ''}`}>{conv.lastMessage}</p>
                        {conv.unreadCount > 0 && (
                            <span className="shrink-0 bg-[#0078fe] text-white min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[11px] font-bold">{conv.unreadCount}</span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-[100dvh] bg-white dark:bg-[#0f172a] overflow-hidden font-sans transition-colors duration-300" onClick={() => setShowMoreMenu(false)}>

            {/* ── Sidebar ─────────────────────────────────────────────────── */}
            <div className={`${showMobileChat ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] lg:w-[360px] shrink-0 border-r border-slate-200 dark:border-slate-800 flex-col bg-white dark:bg-[#1e293b] z-20 transition-colors duration-300 rounded-b-lg`}>

                {/* Header */}
                <div className="px-4 pt-5 pb-3 bg-indigo-50/80 dark:bg-[#1e2335] rounded-3xl rounded-tl-none">
                    <div className="flex items-center justify-between mb-4">
                        {/* Avatar + greeting */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-base shrink-0">
                                {userInfo.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{getGreeting()}</p>
                                <h2 className="text-[16px] font-bold text-slate-800 dark:text-white leading-tight">{userInfo.username}</h2>
                            </div>
                        </div>
                        {/* Action icons */}
                        <div className="flex items-center gap-1">
                            <button onClick={(e) => { e.stopPropagation(); setShowSearch(s => !s); setSearchTerm(''); }} className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="Search">
                                <SearchIcon />
                            </button>
                            <div className="relative">
                                <button onClick={(e) => { e.stopPropagation(); setShowMoreMenu(m => !m); }} className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title="More">
                                    <MoreIcon />
                                </button>
                                {showMoreMenu && (
                                    <div onClick={e => e.stopPropagation()} className="absolute right-0 top-10 w-48 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700/80 rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] z-50 overflow-hidden">
                                        <button onClick={openSettings} className="w-full text-left px-4 py-3 text-[14px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Edit Profile</button>
                                        <button onClick={toggleTheme} className="w-full flex justify-between items-center px-4 py-3 text-[14px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                                            <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
                                            {isDarkMode ? (
                                                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                                </svg>
                                            ) : (
                                                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                                </svg>
                                            )}
                                        </button>
                                        <div className="border-t border-slate-100 dark:border-slate-700"></div>
                                        <button onClick={() => { localStorage.removeItem('userInfo'); socket.disconnect(); navigate('/login'); }} className="w-full text-left px-4 py-3 text-[14px] text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">Sign Out</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="relative flex items-center bg-white/60 dark:bg-slate-900/40 rounded-full p-1 border border-indigo-100/50 dark:border-slate-700/30">
                        {/* Animated pill background */}
                        <div 
                            className="absolute top-1 bottom-1 w-[calc(33.333% - 2.66px)] bg-[#7064ff] rounded-full transition-transform duration-300 ease-out shadow-sm pointer-events-none"
                            style={{ 
                                width: 'calc(33.33% - 2.5px)', 
                                transform: `translateX(${['chats', 'groups', 'contacts'].indexOf(activeTab) * 100}%)` 
                            }}
                        ></div>
                        {['chats', 'groups', 'contacts'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => { setActiveTab(tab); setSearchTerm(''); setShowSearch(false); }}
                                className={`relative z-10 flex-1 py-1.5 text-[13px] font-semibold rounded-full transition-colors capitalize ${activeTab === tab ? 'text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Search Bar (slides down) */}
                {showSearch && (
                    <div className="px-4 pb-3 bg-indigo-50/80 dark:bg-[#1e2335]">
                        <div className="relative">
                            <input
                                autoFocus
                                type="text"
                                placeholder={`Search ${activeTab}...`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-base rounded-lg pl-9 pr-4 py-2.5 text-slate-800 dark:text-white focus:outline-none focus:border-[#0078fe] transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500"
                            />
                            <svg className="w-4 h-4 absolute left-3 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </div>
                )}

                {/* Content area sliding container */}
                <div className="flex-1 overflow-x-hidden relative">
                    <div 
                        className="flex h-full w-[300%] transition-transform duration-300 ease-in-out"
                        style={{ transform: `translateX(-${['chats', 'groups', 'contacts'].indexOf(activeTab) * (100/3)}%)` }}
                    >

                        {/* ── CHATS Tab ── */}
                        <div className="w-1/3 h-full overflow-y-auto">
                            {(() => {
                                const list = directChats.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
                                return list.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500 gap-2">
                                        <svg className="w-10 h-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                        <p className="text-[13px]">No direct chats yet</p>
                                        <p className="text-[12px] text-slate-300 dark:text-slate-600">Add contacts to start chatting</p>
                                    </div>
                                ) : (
                                    <div className="py-1">{list.map(renderConvItem)}</div>
                                );
                            })()}
                        </div>

                        {/* ── GROUPS Tab ── */}
                        <div className="w-1/3 h-full overflow-y-auto">
                            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                                <button
                                    onClick={() => setShowGroupModal(true)}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-[13px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-[#0078fe] hover:text-[#0078fe] transition-colors"
                                >
                                    <PlusIcon /> New Group
                                </button>
                            </div>
                            {(() => {
                                const list = groupRooms.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
                                return list.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-slate-400 dark:text-slate-500 gap-2">
                                        <svg className="w-10 h-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>
                                        <p className="text-[13px]">No groups yet</p>
                                    </div>
                                ) : (
                                    <div className="py-1">{list.map(renderConvItem)}</div>
                                );
                            })()}
                        </div>

                        {/* ── CONTACTS Tab ── */}
                        <div className="w-1/3 h-full overflow-y-auto">
                            <div className="p-4 space-y-4">

                                {/* Search status / error */}
                                {isSearchingContact && (
                                    <p className="text-[13px] text-slate-400 dark:text-slate-500 text-center">Searching...</p>
                                )}
                                {contactSearchError && (
                                    <p className="text-[13px] text-red-400 text-center">{contactSearchError}</p>
                                )}

                                {/* ── Saved contacts matching the search ── */}
                                {searchTerm.trim().length > 0 && savedContactResults.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Contacts</p>
                                        <div className="space-y-1">
                                            {savedContactResults.map(contact => (
                                                <div key={contact.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-[#7064ff] flex items-center justify-center text-white font-bold text-sm shrink-0">{contact.username.charAt(0).toUpperCase()}</div>
                                                        <div>
                                                            <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">{contact.username}</p>
                                                            <p className="text-[12px] text-slate-400 dark:text-slate-500">{contact.email}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleOpenDirectChat(contact)}
                                                        className="p-2 rounded-full text-slate-400 hover:text-[#0078fe] hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Message"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ── Unknown user (exact email, not in contacts) – show Add button ── */}
                                {unknownUserResult && (
                                    <div>
                                        <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">New Contact</p>
                                        <div className="flex items-center justify-between p-3 rounded-lg border border-[#0078fe]/30 bg-blue-50/60 dark:bg-blue-500/10">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-white font-bold text-sm">{unknownUserResult.username.charAt(0).toUpperCase()}</div>
                                                <div>
                                                    <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">{unknownUserResult.username}</p>
                                                    <p className="text-[12px] text-slate-400 dark:text-slate-500">{unknownUserResult.email}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleAddContact(unknownUserResult)}
                                                className="px-3 py-1.5 bg-[#0078fe] text-white text-[12px] font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                                            >
                                                + Add
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Full contacts list (when no search active) ── */}
                                {searchTerm.trim().length === 0 && contacts.length > 0 && (
                                    <div>
                                        <p className="text-[12px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">My Contacts ({contacts.length})</p>
                                        <div className="space-y-1">
                                            {contacts.map(contact => (
                                                <div key={contact.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-white font-bold text-sm shrink-0">{contact.username.charAt(0).toUpperCase()}</div>
                                                        <div>
                                                            <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">{contact.username}</p>
                                                            <p className="text-[12px] text-slate-400 dark:text-slate-500">{contact.email}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleOpenDirectChat(contact)}
                                                        className="p-2 rounded-full text-slate-400 hover:text-[#0078fe] hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Message"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Empty state */}
                                {contacts.length === 0 && searchTerm.trim().length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-36 text-slate-400 dark:text-slate-500 gap-2">
                                        <svg className="w-10 h-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        <p className="text-[13px]">No contacts yet</p>
                                        <p className="text-[12px] text-center text-slate-300 dark:text-slate-600">Search by name or email to find people</p>
                                    </div>
                                )}

                                {/* No results state */}
                                {searchTerm.trim().length > 0 && !isSearchingContact && savedContactResults.length === 0 && !unknownUserResult && !contactSearchError && (
                                    <div className="flex flex-col items-center justify-center h-28 text-slate-400 dark:text-slate-500 gap-2">
                                        <p className="text-[13px]">No contacts found for "{searchTerm}"</p>
                                        <p className="text-[12px] text-center text-slate-300 dark:text-slate-600">Try their exact email to add as a new contact</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Chat Canvas ──────────────────────────────────────────────── */}
            <div className={`${showMobileChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 relative`}>
                <ChatWindow
                    socket={socket}
                    currentUser={userInfo}
                    roomId={activeRoom}
                    roomName={conversations.find(c => c.id === activeRoom)?.name || activeRoom}
                    isGroupChat={conversations.find(c => c.id === activeRoom)?.isGroup}
                    targetUserId={conversations.find(c => c.id === activeRoom)?.targetUserId}
                    contacts={contacts}
                    onAddContact={handleAddContact}
                    onBack={() => setShowMobileChat(false)}
                />
            </div>

            {/* ── Settings Modal ───────────────────────────────────────────── */}
            {showSettingsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-md shadow-lg p-6">
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Edit Profile</h3>
                            <button onClick={() => setShowSettingsModal(false)} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleSaveProfile} className="space-y-4">
                            <div>
                                <label className="block text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Username</label>
                                <input type="text" value={editUsername} onChange={e => setEditUsername(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-lg py-3 px-4 text-slate-800 dark:text-white focus:outline-none focus:border-[#0078fe] transition-colors text-base" />
                            </div>
                            <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                                <span className="text-[14px] font-semibold text-slate-700 dark:text-slate-200">Dark Mode</span>
                                <button type="button" onClick={toggleTheme} className={`w-12 h-6 rounded-full transition-colors relative flex items-center ${isDarkMode ? 'bg-[#0078fe]' : 'bg-slate-300'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full absolute transition-transform duration-200 ${isDarkMode ? 'translate-x-[26px]' : 'translate-x-0.5'}`}></div>
                                </button>
                            </div>
                            <div className="flex flex-col gap-2 pt-2">
                                <button type="submit" disabled={isSaving || !editUsername.trim()} className="w-full py-3 rounded-lg text-[15px] font-semibold bg-[#0078fe] text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button type="button" onClick={() => { localStorage.removeItem('userInfo'); socket.disconnect(); navigate('/login'); }} className="w-full py-3 rounded-lg text-[15px] font-semibold border border-slate-200 dark:border-slate-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                                    Sign Out
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── New Group Modal ──────────────────────────────────────────── */}
            {showGroupModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-lg shadow-lg p-6">
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white">New Group</h3>
                            <button onClick={() => setShowGroupModal(false)} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleCreateGroup} className="space-y-4">
                            <div>
                                <label className="block text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Group Name</label>
                                <input autoFocus type="text" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder="e.g. Design Team"
                                    className="w-full bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-lg py-3 px-4 text-slate-800 dark:text-white focus:outline-none focus:border-[#0078fe] transition-colors text-base placeholder:text-slate-400" />
                            </div>
                            <div>
                                <label className="block text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-2">Add Members</label>
                                <div className="max-h-56 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                                    {usersForModal.filter(u => u.id !== userInfo.id).map(u => (
                                        <label key={u.id} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${selectedUsers.includes(u.id) ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                            <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={() => setSelectedUsers(prev => prev.includes(u.id) ? prev.filter(i => i !== u.id) : [...prev, u.id])} className="w-4 h-4 accent-[#0078fe]" />
                                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-sm">{u.username.charAt(0)}</div>
                                            <span className="text-[14px] font-semibold text-slate-700 dark:text-slate-200">{u.username}</span>
                                            {u.onlineStatus && <span className="w-2 h-2 rounded-full bg-emerald-500 ml-auto"></span>}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => setShowGroupModal(false)} className="flex-1 py-2.5 rounded-lg text-[14px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Cancel</button>
                                <button type="submit" className="flex-1 py-2.5 rounded-lg text-[14px] font-semibold bg-[#0078fe] text-white hover:bg-blue-700 transition-colors">Create</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
