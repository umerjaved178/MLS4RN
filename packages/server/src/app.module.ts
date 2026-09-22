import { Module } from "@nestjs/common";
import { KeyPackagesModule } from "./key-packages/key-packages.module";
import { GroupsModule } from "./groups/groups.module";

@Module({
  imports: [KeyPackagesModule, GroupsModule],
})
export class AppModule {}
