import { useEffect, useRef, useState, useCallback } from 'react';
import { ChatMessage } from '../types';
import { sound } from '../utils/sound';

export function useGhostSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isClosingIntentionally = useRef<boolean>(false);

  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  
  // Persist session userId in sessionStorage so page reload re-uses the exact same identity
  const [userId, setUserId] = useState<string>(() => {
    try {
      return sessionStorage.getItem('anon_chat_uid') || '';
    } catch {
      return '';
    }
  });
  const userIdRef = useRef<string>(userId);
  userIdRef.current = userId;

  const [alias, setAlias] = useState<string>('');
  const [avatar, setAvatar] = useState<string>(() => {
    try {
      return sessionStorage.getItem('anon_chat_avatar') || '0';
    } catch {
      return '0';
    }
  });
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingAvatars, setTypingAvatars] = useState<string[]>([]);

  const isHttpFallback = useRef<boolean>(false);

  // Dispatch events from WebSocket or HTTP polling
  const handleServerEvent = useCallback((data: any) => {
    switch (data.type) {
      case 'connection:init':
        setUserId(data.userId);
        userIdRef.current = data.userId;
        try {
          sessionStorage.setItem('anon_chat_uid', data.userId);
        } catch {}

        setAlias(data.alias);
        if (data.avatar) {
          setAvatar(data.avatar);
          try {
            sessionStorage.setItem('anon_chat_avatar', data.avatar);
          } catch {}
        }
        setOnlineCount(data.onlineCount || 1);
        if (Array.isArray(data.recentMessages)) {
          setMessages(
            data.recentMessages.map((m: ChatMessage) => ({
              ...m,
              isSelf: m.senderId === data.userId,
            }))
          );
        }
        break;

      case 'server:online_count':
        if (typeof data.onlineCount === 'number') {
          setOnlineCount(data.onlineCount);
        }
        break;

      case 'identity:updated':
        if (data.avatar) {
          setAvatar(data.avatar);
          try {
            sessionStorage.setItem('anon_chat_avatar', data.avatar);
          } catch {}
        }
        break;

      case 'chat:new_message': {
        const msg: ChatMessage = data.message;
        const isSelf = msg.senderId === userIdRef.current;
        if (!isSelf && msg.msgType !== 'system') {
          sound.playMessageReceived();
        }
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, { ...msg, isSelf }];
        });
        break;
      }

      case 'chat:typing_update': {
        const others = (data.typingUsers || [])
          .filter((u: { userId: string; avatar: string }) => u.userId !== userIdRef.current)
          .map((u: { userId: string; avatar: string }) => u.avatar);
        setTypingAvatars(others);
        break;
      }

      case 'chat:message_reaction': {
        setMessages(prev =>
          prev.map(m => {
            if (m.id === data.messageId) {
              return { ...m, reactions: data.reactions };
            }
            return m;
          })
        );
        break;
      }
    }
  }, []);

  // HTTP polling fallback if needed
  const startHttpFallback = useCallback(async () => {
    if (isHttpFallback.current) return;
    isHttpFallback.current = true;

    try {
      const initRes = await fetch('/api/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userIdRef.current || undefined }),
      });
      if (initRes.ok) {
        const initData = await initRes.json();
        setConnectionStatus('connected');
        handleServerEvent({
          type: 'connection:init',
          ...initData,
        });
      }
    } catch {}

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = window.setInterval(async () => {
      if (!isMountedRef.current || !isHttpFallback.current) return;
      if (!userIdRef.current) return;

      try {
        const res = await fetch(`/api/poll?userId=${encodeURIComponent(userIdRef.current)}`);
        if (res.ok) {
          const pollData = await res.json();
          if (Array.isArray(pollData.events)) {
            for (const ev of pollData.events) {
              handleServerEvent(ev);
            }
          }
        }
      } catch {}
    }, 1200);
  }, [handleServerEvent]);

  // Connect via WebSocket
  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setConnectionStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const query = userIdRef.current ? `?userId=${encodeURIComponent(userIdRef.current)}` : '';
    const wsUrl = `${protocol}//${window.location.host}/ws${query}`;

    try {
      isClosingIntentionally.current = false;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        setConnectionStatus('connected');
        isHttpFallback.current = false;
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleServerEvent(data);
        } catch (err) {
          console.error('Failed to parse socket message:', err);
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current || isClosingIntentionally.current) return;
        setConnectionStatus('disconnected');
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

        startHttpFallback();

        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (isMountedRef.current) {
            connect();
          }
        }, 3000);
      };

      ws.onerror = () => {
        if (!isClosingIntentionally.current) {
          startHttpFallback();
        }
      };
    } catch {
      startHttpFallback();
    }
  }, [handleServerEvent, startHttpFallback]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      isClosingIntentionally.current = true;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Send action via WebSocket or HTTP fallback
  const sendAction = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return;
    }
    if (userIdRef.current) {
      fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userIdRef.current,
          data,
        }),
      }).catch(() => {});
    }
  }, []);

  const updateAvatar = useCallback((newAvatar: string) => {
    setAvatar(newAvatar);
    try {
      sessionStorage.setItem('anon_chat_avatar', newAvatar);
    } catch {}
    sendAction({
      type: 'identity:update',
      avatar: newAvatar,
    });
  }, [sendAction]);

  const sendMessage = useCallback((
    text: string,
    options?: {
      msgType?: 'text' | 'audio' | 'image';
      mediaUrl?: string;
      duration?: number;
    }
  ) => {
    if (!text.trim() && !options?.mediaUrl) return;

    sound.playMessageSent();
    sendAction({
      type: 'chat:message',
      text: text.trim(),
      msgType: options?.msgType || 'text',
      mediaUrl: options?.mediaUrl,
      duration: options?.duration,
    });
  }, [sendAction]);

  const sendTyping = useCallback((isTyping: boolean) => {
    sendAction({
      type: 'chat:typing',
      isTyping,
    });
  }, [sendAction]);

  const triggerTyping = useCallback(() => {
    sendTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      sendTyping(false);
    }, 1800);
  }, [sendTyping]);

  const sendReaction = useCallback((messageId: string, emoji: string) => {
    sound.playClick();
    sendAction({
      type: 'chat:reaction',
      messageId,
      emoji,
    });
  }, [sendAction]);

  return {
    connectionStatus,
    userId,
    alias,
    avatar,
    onlineCount,
    messages,
    typingAvatars,
    updateAvatar,
    sendMessage,
    triggerTyping,
    sendReaction,
  };
}
