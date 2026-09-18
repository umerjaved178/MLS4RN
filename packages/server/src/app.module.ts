import { Module } from "@nestjs/common";
import { KeyPackagesModule } from "./key-packages/key-packages.module";

@Module({
  imports: [KeyPackagesModule],
})
export class AppModule {}
