import { Module } from "@nestjs/common";
import { KeyPackagesModule } from "./key-packages/key-packages.module";
import { GroupsModule } from "./groups/groups.module";
import { WelcomesModule } from "./welcomes/welcomes.module";

@Module({
  imports: [KeyPackagesModule, GroupsModule, WelcomesModule],
})
export class AppModule {}
