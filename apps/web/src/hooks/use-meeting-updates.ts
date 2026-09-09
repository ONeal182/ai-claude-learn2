import { useEffect, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { getWebSocketClient } from '@/lib/websocket-client';

interface MeetingUpdate {
  type: 'summary_status_changed' | 'file_status_changed';
  meetingId: string;
  summaryStatus?: 'pending' | 'processing' | 'done' | 'failed' | null;
  summary?: string | null;
  decisions?: unknown[] | null;
  fileId?: string;
  fileStatus?: 'pending' | 'processing' | 'done' | 'failed';
  timestamp: string;
}

interface UseMeetingUpdatesOptions {
  meetingId: string;
  accessToken: string;
  onUpdate: (update: MeetingUpdate) => void;
  enabled?: boolean;
}

export function useMeetingUpdates({
  meetingId,
  accessToken,
  onUpdate,
  enabled = true,
}: UseMeetingUpdatesOptions) {
  const socketRef = useRef<Socket | null>(null);
  const subscribed = useRef(false);

  const subscribe = useCallback(() => {
    if (!socketRef.current || subscribed.current) return;

    socketRef.current.emit(
      'subscribe:meeting',
      { meetingId },
      (response: { subscribed?: boolean; error?: string }) => {
        if (response?.subscribed) {
          subscribed.current = true;
          console.log('[WebSocket] Subscribed to meeting:', meetingId);
        } else if (response?.error) {
          console.error('[WebSocket] Subscription error:', response.error);
        }
      },
    );
  }, [meetingId]);

  const unsubscribe = useCallback(() => {
    if (!socketRef.current || !subscribed.current) return;

    socketRef.current.emit(
      'unsubscribe:meeting',
      { meetingId },
      (response: { unsubscribed?: boolean }) => {
        if (response?.unsubscribed) {
          subscribed.current = false;
          console.log('[WebSocket] Unsubscribed from meeting:', meetingId);
        }
      },
    );
  }, [meetingId]);

  useEffect(() => {
    if (!enabled || !accessToken) return;

    // Get or create WebSocket connection
    const socket = getWebSocketClient(accessToken);
    socketRef.current = socket;

    // Subscribe when connected
    if (socket.connected) {
      subscribe();
    } else {
      socket.once('connect', subscribe);
    }

    // Listen for meeting updates
    const handleUpdate = (update: MeetingUpdate) => {
      if (update.meetingId === meetingId) {
        console.log('[WebSocket] Meeting update received:', update);
        onUpdate(update);
      }
    };

    socket.on('meeting:update', handleUpdate);

    // Cleanup
    return () => {
      socket.off('meeting:update', handleUpdate);
      unsubscribe();
    };
  }, [meetingId, accessToken, enabled, onUpdate, subscribe, unsubscribe]);
}
