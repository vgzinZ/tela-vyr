import type { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer, type WebSocket as WebSocketType } from "ws";

export type SignalingParticipant = {
  id: string;
  nickname: string;
  avatar: string;
  streaming: boolean;
};

type RoomClient = SignalingParticipant & {
  room: string;
  socket: WebSocketType;
};

type SignalingMessage =
  | { type: "signal"; to: string; data: unknown }
  | { type: "streaming"; streaming: boolean }
  | { type: "leave" };

const rooms = new Map<string, Map<string, RoomClient>>();

function send(socket: WebSocketType, message: unknown) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(room: Map<string, RoomClient>, message: unknown, exceptId?: string) {
  room.forEach((client) => {
    if (client.id !== exceptId) send(client.socket, message);
  });
}

function safeText(value: string | null, fallback: string, maxLength: number) {
  const cleaned = (value ?? "").trim().replace(/[<>]/g, "");
  return cleaned.slice(0, maxLength) || fallback;
}

export function registerSignaling(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/signaling") return;

    wss.handleUpgrade(request, socket, head, (clientSocket) => {
      wss.emit("connection", clientSocket, request);
    });
  });

  wss.on("connection", (socket, request) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const roomId = safeText(url.searchParams.get("room"), "", 12).toUpperCase();
    if (!roomId) {
      socket.close(1008, "Sala inválida");
      return;
    }

    const client: RoomClient = {
      id: randomUUID().replaceAll("-", "").slice(0, 12),
      nickname: safeText(url.searchParams.get("nickname"), "Visitante", 24),
      avatar: safeText(url.searchParams.get("avatar"), "violet", 20),
      streaming: false,
      room: roomId,
      socket,
    };
    const room = rooms.get(roomId) ?? new Map<string, RoomClient>();
    rooms.set(roomId, room);
    const existingParticipants = Array.from(room.values()).map(toPublicParticipant);
    room.set(client.id, client);

    send(socket, {
      type: "welcome",
      clientId: client.id,
      participants: existingParticipants,
    });
    broadcast(room, { type: "participant-joined", participant: toPublicParticipant(client) }, client.id);

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as SignalingMessage;
        if (message.type === "signal" && typeof message.to === "string") {
          const target = room.get(message.to);
          if (target) send(target.socket, { type: "signal", from: client.id, data: message.data });
        }
        if (message.type === "streaming") {
          client.streaming = Boolean(message.streaming);
          broadcast(room, { type: "participant-updated", participant: toPublicParticipant(client) }, client.id);
        }
        if (message.type === "leave") socket.close(1000, "Saiu da sala");
      } catch {
        send(socket, { type: "error", message: "Mensagem de sinalização inválida." });
      }
    });

    const cleanUp = () => {
      if (!room.has(client.id)) return;
      room.delete(client.id);
      broadcast(room, { type: "participant-left", id: client.id });
      if (room.size === 0) rooms.delete(roomId);
    };
    socket.on("close", cleanUp);
    socket.on("error", cleanUp);
  });

  return wss;
}

function toPublicParticipant(client: RoomClient): SignalingParticipant {
  return {
    id: client.id,
    nickname: client.nickname,
    avatar: client.avatar,
    streaming: client.streaming,
  };
}
