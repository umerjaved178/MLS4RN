import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { GroupsService } from "./groups.service";

interface PublishBody {
  message: string;
  sender?: string;
}

@Controller("groups")
export class GroupsController {
  constructor(private readonly service: GroupsService) {}

  /** Publish a message (handshake or application ciphertext) to a group's log. */
  @Post(":groupId/messages")
  publish(@Param("groupId") groupId: string, @Body() body: PublishBody) {
    if (!body?.message) throw new BadRequestException("message is required");
    const stored = this.service.publish(groupId, body.message, body.sender);
    return { seq: stored.seq };
  }

  /** Fetch all messages after `since` (0 or omitted = from the start). */
  @Get(":groupId/messages")
  since(@Param("groupId") groupId: string, @Query("since") since?: string) {
    const from = since ? Number.parseInt(since, 10) : 0;
    const messages = this.service.since(groupId, Number.isFinite(from) ? from : 0);
    const cursor = messages.length ? messages[messages.length - 1].seq : from || 0;
    return {
      messages: messages.map((m) => ({ seq: m.seq, sender: m.sender ?? null, message: m.message })),
      cursor,
    };
  }
}
