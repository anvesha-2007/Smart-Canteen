import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import { authenticateToken, type UserRole } from '../middleware/auth.ts';

interface ClientMeta {
  ws: WebSocket;
  userId: number;
  role: UserRole;
}

class RealTimeHub {
  private wss: WebSocketServer | null = null;
  private clients: Set<ClientMeta> = new Set();

  init(server: Server) {
    if (this.wss) return;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', async (ws, req) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost');
        const token = url.searchParams.get('token');
        if (!token) {
          ws.close(4001, 'Missing auth token');
          return;
        }
        const user = await authenticateToken(token);
        if (!user || !user.isActive) {
          ws.close(4003, 'Unauthorized');
          return;
        }

        const meta: ClientMeta = { ws, userId: user.id, role: user.roleName };
        this.clients.add(meta);

        ws.send(
          JSON.stringify({
            type: 'ws:connected',
            payload: { userId: user.id, role: user.roleName },
          })
        );

        ws.on('close', () => {
          this.clients.delete(meta);
        });

        ws.on('error', () => {
          this.clients.delete(meta);
        });
      } catch {
        ws.close(4000, 'Connection error');
      }
    });
  }

  emitToUser(userId: number, event: string, payload: unknown) {
    const message = JSON.stringify({ type: event, payload, ts: Date.now() });
    for (const client of this.clients) {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  emitToRoles(targetRoles: UserRole[], event: string, payload: unknown) {
    const message = JSON.stringify({ type: event, payload, ts: Date.now() });
    for (const client of this.clients) {
      if (
        targetRoles.includes(client.role) &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(message);
      }
    }
  }

  broadcast(event: string, payload: unknown) {
    const message = JSON.stringify({ type: event, payload, ts: Date.now() });
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }
}

export const wsHub = new RealTimeHub();
