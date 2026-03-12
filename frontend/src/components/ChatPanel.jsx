import { useState, useEffect, useRef, useCallback } from 'react';
import { chatAPI } from '../api/client';

const CHAT_POLL_MS = 3000;

function ChatPanel({ rideId, currentUserId, otherName, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [unread, setUnread] = useState(0);

  const lastTimestampRef = useRef(null);
  const pollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const initialLoadRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = useCallback(async () => {
    if (!rideId) return;
    try {
      const res = await chatAPI.getMessages(rideId, lastTimestampRef.current);
      const newMsgs = res.data.messages || [];
      if (newMsgs.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.message_id));
          const unique = newMsgs.filter((m) => !existingIds.has(m.message_id));
          return unique.length > 0 ? [...prev, ...unique] : prev;
        });
        lastTimestampRef.current = newMsgs[newMsgs.length - 1].created_at;
        // Count unread if panel is closed
        if (!open) {
          const othersNew = newMsgs.filter((m) => m.sender_id !== currentUserId);
          if (othersNew.length > 0) {
            setUnread((prev) => prev + othersNew.length);
          }
        }
      }
    } catch (err) {
      console.error('fetchMessages error:', err);
    }
  }, [rideId, currentUserId, open]);

  // Start/stop polling
  useEffect(() => {
    if (!rideId) return;

    // Initial load of all messages
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      fetchMessages();
    }

    pollRef.current = setInterval(fetchMessages, CHAT_POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [rideId, fetchMessages]);

  // Scroll to bottom when messages change and panel is open
  useEffect(() => {
    if (open) scrollToBottom();
  }, [messages, open]);

  // Clear unread when opening
  const handleToggle = () => {
    setOpen((prev) => {
      if (!prev) setUnread(0);
      return !prev;
    });
  };

  const handleSend = async () => {
    if (!input.trim() || sending || disabled) return;
    setError(null);
    setSending(true);
    try {
      const res = await chatAPI.sendMessage(rideId, input.trim());
      const msg = res.data.message;
      setMessages((prev) => {
        const exists = prev.some((m) => m.message_id === msg.message_id);
        return exists ? prev : [...prev, msg];
      });
      setInput('');
      lastTimestampRef.current = msg.created_at;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-wrapper">
      <button className="chat-toggle-btn" onClick={handleToggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>{open ? 'Close Chat' : `Chat with ${otherName}`}</span>
        {!open && unread > 0 && (
          <span className="chat-unread-badge">{unread}</span>
        )}
      </button>

      {open && (
        <div className="chat-panel">
          <div className="chat-messages">
            {messages.length === 0 && (
              <p className="chat-empty">No messages yet. Say hello!</p>
            )}
            {messages.map((msg) => (
              <div
                key={msg.message_id}
                className={`chat-msg ${msg.sender_id === currentUserId ? 'own' : 'other'}`}
              >
                <div className="chat-msg-bubble">
                  <p>{msg.content}</p>
                  <span className="chat-msg-time">{formatTime(msg.created_at)}</span>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {error && <div className="chat-error">{error}</div>}

          {!disabled && (
            <div className="chat-input-row">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                maxLength={500}
                disabled={sending}
              />
              <button onClick={handleSend} disabled={!input.trim() || sending}>
                {sending ? '...' : 'Send'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ChatPanel;
