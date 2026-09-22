import { Module } from "@nestjs/common";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";
import { GroupsGateway } from "./groups.gateway";

@Module({
  controllers: [GroupsController],
  providers: [GroupsService, GroupsGateway],
})
export class GroupsModule {}
