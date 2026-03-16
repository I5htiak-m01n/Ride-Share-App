import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { chatAPI } from '../api/client';

const CHAT_POLL_MS = 3000;

function ChatPanel({ rideId, currentUserId, otherName, disabled = false, onRideCancelled }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [unread, setUnread] = useState(0);
  const [cancelActionLoading, setCancelActionLoading] = useState(false);

  const lastTimestampRef = useRef(null);
  const pollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const initialLoadRef = useRef(false);
  const cancelledRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Detect if there's a pending cancel request (no accepted/declined after it)
  const hasPendingCancelRequest = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const mt = messages[i].message_type;
      if (mt === 'cancel_accepted' || mt === 'cancel_declined') return false;
      if (mt === 'cancel_request') return true;
    }
    return false;
  }, [messages]);

  // Find the latest pending cancel request (to show accept/decline to the other party)
  const pendingCancelRequest = useMemo(() => {
    if (!hasPendingCancelRequest) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].message_type === 'cancel_request') return messages[i];
    }
    return null;
  }, [messages, hasPendingCancelRequest]);

  // Is the pending cancel request from the current user?
  const isOwnPendingCancel = useMemo(() => {
    return pendingCancelRequest?.sender_id === currentUserId;
  }, [pendingCancelRequest, currentUserId]);

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
        // Detect mutual cancellation accepted by the other party
        const cancelAccepted = newMsgs.find(
          (m) => m.message_type === 'cancel_accepted' && m.sender_id !== currentUserId
        );
        if (cancelAccepted && !cancelledRef.current) {
          cancelledRef.current = true;
          if (onRideCancelled) onRideCancelled();
        }
      }
    } catch (err) {
      console.error('fetchMessages error:', err);
    }
  }, [rideId, currentUserId, open, onRideCancelled]);

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

  const handleAskToCancel = async () => {
    setCancelActionLoading(true);
    setError(null);
    try {
      const res = await chatAPI.sendCancelRequest(rideId);
      const msg = res.data.message;
      setMessages((prev) => {
        const exists = prev.some((m) => m.message_id === msg.message_id);
        return exists ? prev : [...prev, msg];
      });
      lastTimestampRef.current = msg.created_at;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send cancellation request');
    } finally {
      setCancelActionLoading(false);
    }
  };

  const handleAcceptCancel = async () => {
    setCancelActionLoading(true);
    setError(null);
    try {
      const res = await chatAPI.respondToCancelRequest(rideId, true);
      const msg = res.data.message;
      setMessages((prev) => {
        const exists = prev.some((m) => m.message_id === msg.message_id);
        return exists ? prev : [...prev, msg];
      });
      cancelledRef.current = true;
      if (onRideCancelled) onRideCancelled();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to accept cancellation');
    } finally {
      setCancelActionLoading(false);
    }
  };

  const handleDeclineCancel = async () => {
    setCancelActionLoading(true);
    setError(null);
    try {
      const res = await chatAPI.respondToCancelRequest(rideId, false);
      const msg = res.data.message;
      setMessages((prev) => {
        const exists = prev.some((m) => m.message_id === msg.message_id);
        return exists ? prev : [...prev, msg];
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to decline cancellation');
    } finally {
      setCancelActionLoading(false);
    }
  };

  const handleRetractCancel = async () => {
    setCancelActionLoading(true);
    setError(null);
    try {
      const res = await chatAPI.retractCancelRequest(rideId);
      const msg = res.data.message;
      setMessages((prev) => {
        const exists = prev.some((m) => m.message_id === msg.message_id);
        return exists ? prev : [...prev, msg];
      });
      lastTimestampRef.current = msg.created_at;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to retract cancellation request');
    } finally {
      setCancelActionLoading(false);
    }
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = (msg) => {
    const isOwn = msg.sender_id === currentUserId;
    const msgType = msg.message_type || 'text';

    // System-style messages for cancel actions
    if (msgType === 'cancel_request') {
      const showActions = !isOwn && pendingCancelRequest?.message_id === msg.message_id;
      return (
        <div key={msg.message_id} className="chat-msg system">
          <div style={systemMsgStyle}>
            <p style={{ margin: '0 0 4px', fontWeight: 500 }}>
              {isOwn ? 'You requested to cancel this ride' : `${otherName} wants to cancel the ride`}
            </p>
            <span className="chat-msg-time">{formatTime(msg.created_at)}</span>
            {showActions && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={handleAcceptCancel}
                  disabled={cancelActionLoading}
                  style={acceptBtnStyle}
                >
                  {cancelActionLoading ? '...' : 'Accept (No Fee)'}
                </button>
                <button
                  onClick={handleDeclineCancel}
                  disabled={cancelActionLoading}
                  style={declineBtnStyle}
                >
                  Decline
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (msgType === 'cancel_accepted') {
      return (
        <div key={msg.message_id} className="chat-msg system">
          <div style={{ ...systemMsgStyle, background: '#E8F5E9' }}>
            <p style={{ margin: 0, fontWeight: 500, color: '#2E7D32' }}>
              Mutual cancellation accepted. No fee charged.
            </p>
            <span className="chat-msg-time">{formatTime(msg.created_at)}</span>
          </div>
        </div>
      );
    }

    if (msgType === 'cancel_declined') {
      const isRetract = isOwn && msg.content === 'Retracted cancellation request';
      return (
        <div key={msg.message_id} className="chat-msg system">
          <div style={{ ...systemMsgStyle, background: '#FFF3E0' }}>
            <p style={{ margin: 0, fontWeight: 500, color: '#E65100' }}>
              {isRetract
                ? 'You retracted the cancellation request.'
                : isOwn
                  ? 'You declined the cancellation request.'
                  : 'Cancellation request declined.'}
            </p>
            <span className="chat-msg-time">{formatTime(msg.created_at)}</span>
          </div>
        </div>
      );
    }

    // Normal text message
    return (
      <div
        key={msg.message_id}
        className={`chat-msg ${isOwn ? 'own' : 'other'}`}
      >
        <div className="chat-msg-bubble">
          <p>{msg.content}</p>
          <span className="chat-msg-time">{formatTime(msg.created_at)}</span>
        </div>
      </div>
    );
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
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>

          {error && <div className="chat-error">{error}</div>}

          {!disabled && (
            <>
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
              {hasPendingCancelRequest && isOwnPendingCancel ? (
                <button
                  onClick={handleRetractCancel}
                  disabled={cancelActionLoading}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginTop: '6px',
                    background: 'transparent',
                    color: '#E65100',
                    border: '1px solid #E65100',
                    borderRadius: '6px',
                    cursor: cancelActionLoading ? 'default' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  {cancelActionLoading ? '...' : 'Undo Cancel Request'}
                </button>
              ) : (
                <button
                  onClick={handleAskToCancel}
                  disabled={hasPendingCancelRequest || cancelActionLoading}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginTop: '6px',
                    background: 'transparent',
                    color: hasPendingCancelRequest ? '#999' : '#E11900',
                    border: '1px solid #E2E2E2',
                    borderRadius: '6px',
                    cursor: hasPendingCancelRequest ? 'default' : 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  {hasPendingCancelRequest ? 'Cancel request pending...' : 'Ask to Cancel (No Fee)'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const systemMsgStyle = {
  background: '#F5F5F5',
  borderRadius: '8px',
  padding: '10px 14px',
  textAlign: 'center',
  fontSize: '13px',
  color: '#333',
  margin: '8px 0',
};

const acceptBtnStyle = {
  flex: 1,
  padding: '6px 12px',
  background: '#05944F',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
};

const declineBtnStyle = {
  flex: 1,
  padding: '6px 12px',
  background: '#fff',
  color: '#E11900',
  border: '1px solid #E2E2E2',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
};

export default ChatPanel;
