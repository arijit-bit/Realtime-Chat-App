import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';

const ChatWindow = ({ socket, currentUser, roomId, roomName, isGroupChat, targetUserId, contacts = [], onAddContact, onBack }) => {
    const [messages, setMessages] = useState([]);
    const [currentMessage, setCurrentMessage] = useState('');
    const [typingUsers, setTypingUsers] = useState([]);

    // Member management state
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [usersToInvite, setUsersToInvite] = useState([]);
    const [existingMemberIds, setExistingMemberIds] = useState([]);

    // "Add to contacts" banner state for recipient
    const [senderInfo, setSenderInfo] = useState(null); // the other person in this DM
    const [isAddingContact, setIsAddingContact] = useState(false);
    const [contactAdded, setContactAdded] = useState(false);

    const typingTimeoutRef = useRef(null);
    const messagesEndRef = useRef(null);

    // ── Derive whether the other person is already in contacts ──────────────
    // For DMs: contacts is the current user's contact list (array of user objects)
    const otherPersonInContacts = !isGroupChat && targetUserId
        ? contacts.some(c => c.id === targetUserId || c.id?.toString() === targetUserId?.toString())
        : true; // groups: no banner needed

    // Reset banner state when room changes
    useEffect(() => {
        setSenderInfo(null);
        setContactAdded(false);
    }, [roomId]);

    // If we have a targetUserId but no senderInfo yet, and they're not in contacts,
    // fetch their info so we can show the banner
    useEffect(() => {
        if (!isGroupChat && targetUserId && !otherPersonInContacts && !senderInfo) {
            fetch(`${API_URL}/api/users/search?q=${targetUserId}&currentUserId=${currentUser.id}`)
                .then(r => r.json())
                .then(data => {
                    // Try saved contacts first (they might be there under a different lookup)
                    // Fall back to fetching by checking messages once they load
                })
                .catch(() => {});
        }
    }, [isGroupChat, targetUserId, otherPersonInContacts, senderInfo, currentUser.id, roomId]);

    useEffect(() => {
        if (!socket || !roomId) return;

        const fetchHistory = async () => {
             try {
                const response = await fetch(`${API_URL}/api/messages/${roomId}`);
                const historyData = await response.json();
                setMessages(historyData);
                socket.emit('messages_read', { roomId, readerId: currentUser.id });

                // For DMs: extract the other person's info from message history
                // so we can show their name in the banner
                if (!isGroupChat && historyData.length > 0) {
                    const otherMsg = historyData.find(m => m.senderId !== currentUser.id);
                    if (otherMsg) {
                        setSenderInfo({ id: otherMsg.senderId, username: otherMsg.senderName });
                    }
                }
             } catch (err) { console.error("Failed to load chat history", err); }
        };
        fetchHistory();

        socket.emit('join_room', roomId);

        const messageHandler = (data) => {
             setMessages(prev => [...prev, data]);
             if (data.senderId !== currentUser.id) {
                 socket.emit('messages_read', { roomId, readerId: currentUser.id });
                 // Capture sender info for the banner if we don't have it yet
                 if (!isGroupChat && !senderInfo) {
                     setSenderInfo({ id: data.senderId, username: data.senderName });
                 }
             }
        };

        const readStatusHandler = (data) => {
             if (data.roomId === roomId && data.readerId !== currentUser.id) {
                 setMessages(prev => prev.map(m => m.senderId === currentUser.id ? { ...m, isRead: true } : m));
             }
        };

        const typingHandler = (data) => {
             if (data.roomId === roomId && data.username !== currentUser.username) {
                 setTypingUsers(prev => prev.includes(data.username) ? prev : [...prev, data.username]);
                 setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
             }
        };

        const stopTypingHandler = (data) => {
             if (data.roomId === roomId) {
                 setTypingUsers(prev => prev.filter(user => user !== data.username));
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
    }, [socket, roomId, currentUser.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleTyping = (e) => {
        setCurrentMessage(e.target.value);
        socket.emit('typing', { roomId, username: currentUser.username });
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            socket.emit('stop_typing', { roomId, username: currentUser.username });
        }, 2000);
    };

    const handleSend = async (e) => {
         e.preventDefault();
         if (currentMessage.trim() === '') return;

         if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
         socket.emit('stop_typing', { roomId, username: currentUser.username });

         socket.emit('send_message', {
             roomId,
             senderId: currentUser.id,
             senderName: currentUser.username,
             content: currentMessage,
             timestamp: new Date().toISOString()
         });
         setCurrentMessage('');
    };

    // ── "Add to contacts" handler (called from banner) ──────────────────────
    const handleAddSenderToContacts = async () => {
        // We need the other person's email — fetch via their userId
        if (!senderInfo && !targetUserId) return;
        setIsAddingContact(true);
        try {
            // Get the other user's details by fetching all users and filtering
            // (reuse the existing /api/users endpoint)
            const usersRes = await fetch(`${API_URL}/api/users`);
            const allUsers = await usersRes.json();
            const otherUser = allUsers.find(u =>
                u.id === (senderInfo?.id || targetUserId) ||
                u.id?.toString() === (senderInfo?.id || targetUserId)?.toString()
            );
            if (!otherUser) { alert('Could not find user details'); return; }
            await onAddContact(otherUser);
            setContactAdded(true);
        } catch {
            alert('Failed to add contact');
        } finally {
            setIsAddingContact(false);
        }
    };

    const fetchAvailableUsers = async () => {
        try {
            const usersRes = await fetch(`${API_URL}/api/users`);
            const allUsers = await usersRes.json();
            const membersRes = await fetch(`${API_URL}/api/rooms/${roomId}/members`);
            const members = await membersRes.json();
            const memberIds = members.map(m => m.id);
            setExistingMemberIds(memberIds);
            const filtered = allUsers.filter(u => !memberIds.includes(u.id) && u.id !== currentUser.id);
            setUsersToInvite(filtered);
            setShowInviteModal(true);
        } catch (err) { console.error("Error fetching users for invite", err); }
    };

    const handleAddMember = async (targetUserId) => {
        try {
            const res = await fetch(`${API_URL}/api/rooms/add-member`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName: roomId, userId: targetUserId })
            });
            if (res.ok) {
                setUsersToInvite(prev => prev.filter(u => u.id !== targetUserId));
                setExistingMemberIds(prev => [...prev, targetUserId]);
                alert("Teammate added to the group!");
            }
        } catch (err) { console.error("Error adding member", err); }
    };

    const handleDeleteRoom = async () => {
        if (!window.confirm("Are you sure you want to permanently delete this conversation for the server? This cannot be undone.")) return;
        try {
            const res = await fetch(`${API_URL}/api/rooms/${roomId}`, { method: 'DELETE' });
            if (res.ok) { window.location.reload(); }
            else { alert("Cannot delete this system room."); }
        } catch(err) { console.error("Error deleting room", err); }
    };

    // ── Should we show the "add to contacts" banner? ─────────────────────────
    // Show for DMs only, where the other person sent at least one message,
    // and they're not already in our contacts, and we haven't just added them.
    const showAddToBanner =
        !isGroupChat &&
        !contactAdded &&
        !otherPersonInContacts &&
        senderInfo != null &&
        senderInfo.id !== currentUser.id;

    return (
        <div className="flex flex-col h-full relative transition-colors duration-300">
            {/* Header */}
            <div className="px-4 md:px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b] sticky top-0 z-20 transition-colors duration-300">
                 <div className="flex items-center">
                     {onBack && (
                         <button onClick={onBack} className="md:hidden mr-3 p-2 -ml-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
                             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                         </button>
                     )}
                     <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 text-base mr-3">
                         {(roomName || roomId).charAt(0).toUpperCase()}
                     </div>
                     <div>
                         <h3 className="font-bold text-brand-text dark:text-white text-[17px] tracking-tight">{roomName || roomId}</h3>
                         <p className="text-[13px] text-brand-muted dark:text-slate-400 font-medium">{isGroupChat ? 'Group' : 'Direct Message'}</p>
                     </div>
                 </div>

                 <div className="flex items-center gap-2">
                     {isGroupChat && roomId !== 'Global Lounge' && (
                         <button onClick={fetchAvailableUsers} className="p-2.5 text-slate-500 dark:text-slate-400 hover:text-brand-blue dark:hover:text-white hover:bg-brand-pale-blue dark:hover:bg-slate-700/50 rounded-full transition-colors bg-slate-50/50 dark:bg-slate-800/50" title="Add Members">
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
                         </button>
                     )}

                     <button className="p-2.5 text-slate-500 dark:text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-full transition-colors bg-slate-50/50 dark:bg-slate-800/50" title="Voice Call">
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                     </button>

                     {roomId !== 'Global Lounge' && (
                         <button onClick={handleDeleteRoom} className="p-2.5 text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-colors bg-slate-50/50 dark:bg-slate-800/50 ml-1" title="Delete Conversation">
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                         </button>
                     )}
                 </div>
            </div>

            {/* ── "Add to Contacts" banner ─────────────────────────────────────── */}
            {showAddToBanner && (
                <div className="mx-4 mt-3 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
                    <div className="flex items-center gap-2.5">
                        <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <p className="text-[13px] text-amber-800 dark:text-amber-300 font-medium">
                            <span className="font-bold">{senderInfo.username}</span> is not in your contacts.
                            Add them to keep chatting.
                        </p>
                    </div>
                    <button
                        onClick={handleAddSenderToContacts}
                        disabled={isAddingContact}
                        className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-[12px] font-bold rounded-lg transition-colors"
                    >
                        {isAddingContact ? 'Adding...' : '+ Add'}
                    </button>
                </div>
            )}

            {/* ── Contact added confirmation ────────────────────────────────── */}
            {contactAdded && !isGroupChat && (
                <div className="mx-4 mt-3 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                    <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-[13px] text-emerald-700 dark:text-emerald-300 font-semibold">Added to your contacts!</p>
                </div>
            )}

            {/* Canvas */}
            <div className="flex-1 px-4 sm:px-6 md:px-8 py-6 pb-32 overflow-y-auto space-y-6 bg-brand-light dark:bg-[#0f172a] z-0 transition-colors duration-300">
                {messages.length === 0 && (
                     <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-4">
                         <div className="w-24 h-24 rounded-full bg-white dark:bg-[#1e293b] shadow-sm flex items-center justify-center border border-slate-100 dark:border-slate-800">
                             <svg className="w-10 h-10 text-brand-blue opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                         </div>
                         <p className="font-medium text-sm">Silence is golden. Break it!</p>
                     </div>
                )}
                {messages.map((msg, idx) => {
                     const isOwn = msg.senderId === currentUser.id;
                     return (
                         <div key={idx} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                             <div className={`max-w-[75%] lg:max-w-[65%] flex flex-col gap-1.5 ${isOwn ? 'items-end' : 'items-start'}`}>
                                  {!isOwn && <span className="text-[12px] font-bold text-brand-muted dark:text-slate-400 pl-2">{msg.senderName}</span>}

                                   <div className={`px-4 py-2.5 ${
                                       isOwn
                                       ? 'bg-[#0078fe] text-white rounded-2xl rounded-br-sm'
                                       : 'bg-white dark:bg-[#1e293b] text-slate-800 dark:text-slate-200 rounded-2xl rounded-bl-sm border border-slate-200 dark:border-slate-700'
                                   }`}>
                                      <p className="text-[15px] leading-relaxed break-words font-medium">{msg.content}</p>
                                  </div>

                                  <div className={`flex items-center gap-1.5 px-2 mt-0.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                      {isOwn && (
                                          <span className={`text-[11px] font-extrabold ${msg.isRead ? 'text-brand-blue' : 'text-slate-300 dark:text-slate-600'}`}>
                                               {msg.isRead ? '✓✓' : '✓'}
                                          </span>
                                      )}
                                  </div>
                             </div>
                         </div>
                     )
                })}
                 {/* Typing Indicator Widget */}
                 {typingUsers.length > 0 && (
                     <div className="flex justify-start mb-4">
                         <div className="max-w-[60%] flex flex-col items-start gap-1">
                             <div className="px-4 py-2.5 bg-white dark:bg-[#1e293b] text-slate-500 dark:text-slate-400 rounded-2xl rounded-bl-sm border border-slate-200 dark:border-slate-700 flex items-center gap-2.5">
                                  <span className="text-[13px] font-semibold">{typingUsers.join(', ')} {typingUsers.length > 1 ? 'are' : 'is'} typing</span>
                                  <div className="flex gap-1 items-center">
                                       <div className="w-1.5 h-1.5 bg-brand-blue/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                       <div className="w-1.5 h-1.5 bg-brand-blue/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                       <div className="w-1.5 h-1.5 bg-brand-blue/60 rounded-full animate-bounce"></div>
                                  </div>
                             </div>
                         </div>
                     </div>
                 )}
                 <div ref={messagesEndRef} />
            </div>

            {/* Input Form Fixed at Bottom */}
            <div className="absolute bottom-4 w-full left-0 px-4 md:px-6 z-10">
                 <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-center gap-3 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-full p-2 pl-4">

                     <button type="button" className="p-2 text-slate-400 hover:text-brand-blue dark:hover:text-white transition-colors rounded-full shrink-0" title="Attach image">
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                     </button>

                     <input
                         type="text"
                         value={currentMessage}
                         onChange={handleTyping}
                         placeholder="Type your message..."
                         className="flex-1 bg-transparent py-2.5 text-[15px] font-medium text-brand-text dark:text-white focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                     />

                     <button
                         type="submit"
                         disabled={!currentMessage.trim()}
                         className="w-10 h-10 shrink-0 bg-[#0078fe] hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-600 text-white rounded-full flex items-center justify-center transition-colors disabled:cursor-not-allowed"
                     >
                        <svg className="w-5 h-5 -ml-0.5 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>
                     </button>
                 </form>
            </div>

            {/* Invite Member Modal */}
            {showInviteModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-sm shadow-lg p-7">
                        <div className="flex justify-between items-center mb-6">
                            <h4 className="text-xl font-extrabold text-brand-text dark:text-white tracking-tight">Add Teammates</h4>
                            <button onClick={() => setShowInviteModal(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded-full transition-colors">
                                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {usersToInvite.length === 0 ? (
                                <p className="text-center py-8 text-slate-500 dark:text-slate-400 font-medium text-[15px]">Everyone is already in this loop!</p>
                            ) : (
                                usersToInvite.map(user => (
                                    <div key={user.id} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 hover:bg-brand-pale-blue/50 dark:hover:bg-slate-800 transition-all border border-transparent hover:border-brand-blue/20 dark:hover:border-slate-700">
                                        <div className="flex items-center gap-3.5">
                                            <div className="relative">
                                                 <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center text-sm font-bold uppercase shadow-sm">
                                                     {user.username.charAt(0)}
                                                 </div>
                                                 {user.onlineStatus && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#1e293b]"></span>}
                                            </div>
                                            <span className="text-[15px] font-semibold text-brand-text dark:text-slate-200">{user.username}</span>
                                        </div>
                                        <button
                                           onClick={() => handleAddMember(user.id)}
                                            className="px-4 py-2 text-[13px] font-semibold bg-[#0078fe] text-white rounded-lg hover:bg-blue-700 transition-colors"
                                        >
                                            Add
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700/50">
                             <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center uppercase tracking-widest font-extrabold flex items-center justify-center gap-2">
                                 <svg className="w-4 h-4 text-slate-300 dark:text-slate-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"></path></svg>
                                 Room: {roomId.replace('room_', '')}
                             </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatWindow;
