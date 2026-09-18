import { Module } from "@nestjs/common";
import { KeyPackagesController } from "./key-packages.controller";
import { KeyPackagesService } from "./key-packages.service";

@Module({
  controllers: [KeyPackagesController],
  providers: [KeyPackagesService],
})
export class KeyPackagesModule {}
