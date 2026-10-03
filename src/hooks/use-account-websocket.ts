"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAccountStore } from "@/store/account-store";
import type { WsMessage, EquityUpdatePayload } from "@/types";
import { AccountStatus } from "@prisma/client";

interface UseAccountWebSocketOptions {
  accountId: string | undefined;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECTS = 10;

export function useAccountWebSocket({ accountId }: UseAccountWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  const { setPnlData, updateAccountStatus, updateAccountEquity } =
    useAccountStore();

  const connect = useCallback(() => {
    if (!accountId) return;
    if (reconnectCount.current >= MAX_RECONNECTS) {
      console.warn("[WS] Max reconnects reached for account", accountId);
      return;
    }

    const url = `${WS_URL}/ws?accountId=${accountId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected for account", accountId);
      reconnectCount.current = 0;
      // Subscribe to equity updates
      ws.send(JSON.stringify({ type: "SUBSCRIBE", accountId }));
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;

        switch (msg.type) {
          case "EQUITY_UPDATE": {
            const payload = msg.payload as EquityUpdatePayload;
            setPnlData(payload);
            if (msg.accountId) {
              updateAccountEquity(msg.accountId, payload.equity);
            }
            break;
          }
          case "ACCOUNT_BREACHED": {
            if (msg.accountId) {
              updateAccountStatus(msg.accountId, AccountStatus.BREACHED);
            }
            break;
          }
          case "ACCOUNT_PASSED": {
            if (msg.accountId) {
              updateAccountStatus(msg.accountId, AccountStatus.PASSED);
            }
            break;
          }
          case "PING": {
            ws.send(JSON.stringify({ type: "PONG", payload: {}, timestamp: Date.now() }));
            break;
          }
          default:
            break;
        }
      } catch {
        console.error("[WS] Failed to parse message");
      }
    };

    ws.onerror = () => {
      console.warn("[WS] Error — will reconnect");
    };

    ws.onclose = () => {
      reconnectCount.current += 1;
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };
  }, [accountId, setPnlData, updateAccountStatus, updateAccountEquity]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { ws: wsRef.current };
}
