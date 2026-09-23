import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { WelcomesService } from "./welcomes.service";

interface DepositBody {
  userId: string;
  groupId: string;
  welcome: string;
  ratchetTree: string;
}

@Controller("welcomes")
export class WelcomesController {
  constructor(private readonly service: WelcomesService) {}

  /** Deposit a Welcome (+ ratchet tree) addressed to a newly added member. */
  @Post()
  deposit(@Body() body: DepositBody) {
    if (!body?.userId || !body.groupId || !body.welcome || !body.ratchetTree) {
      throw new BadRequestException("userId, groupId, welcome and ratchetTree are required");
    }
    const stored = this.service.deposit(body.userId, body.groupId, body.welcome, body.ratchetTree);
    return { id: stored.id };
  }

  /** Fetch and clear all pending welcomes for a user. */
  @Get(":userId")
  take(@Param("userId") userId: string) {
    return { welcomes: this.service.take(userId) };
  }
}
