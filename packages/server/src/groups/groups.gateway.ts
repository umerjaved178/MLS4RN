import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { GroupsService } from "./groups.service";

/**
 * Real-time delivery. Clients emit `subscribe` with a groupId to join that
 * group's room, then receive a `message` event for every message published to
 * the group. Same opaque payloads as the REST log — this is just push instead of
 * poll.
 */
@WebSocketGateway({ cors: { origin: "*" } })
export class GroupsGateway implements OnGatewayInit {
  @WebSocketServer() server!: Server;

  constructor(private readonly service: GroupsService) {}

  afterInit(): void {
    this.service.published$.subscribe(({ groupId, message }) => {
      this.server.to(groupId).emit("message", {
        groupId,
        seq: message.seq,
        sender: message.sender ?? null,
        message: message.message,
      });
    });
  }

  @SubscribeMessage("subscribe")
  subscribe(@MessageBody() data: { groupId: string }, @ConnectedSocket() client: Socket) {
    if (data?.groupId) client.join(data.groupId);
    return { subscribed: data?.groupId ?? null };
  }
}
