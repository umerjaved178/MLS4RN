import { Module } from "@nestjs/common";
import { WelcomesController } from "./welcomes.controller";
import { WelcomesService } from "./welcomes.service";

@Module({
  controllers: [WelcomesController],
  providers: [WelcomesService],
})
export class WelcomesModule {}
