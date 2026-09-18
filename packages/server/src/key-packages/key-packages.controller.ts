import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { KeyPackagesService } from "./key-packages.service";

interface PublishBody {
  userId: string;
  keyPackages: string[];
  lastResort?: string;
}

@Controller("key-packages")
export class KeyPackagesController {
  constructor(private readonly service: KeyPackagesService) {}

  /** Publish one or more KeyPackages (base64) for a user. */
  @Post()
  publish(@Body() body: PublishBody) {
    if (!body?.userId || !Array.isArray(body.keyPackages)) {
      throw new BadRequestException("userId and keyPackages[] are required");
    }
    return this.service.publish(body.userId, body.keyPackages, body.lastResort);
  }

  /** Claim (pop) one KeyPackage for a user, to add them to a group. */
  @Post(":userId/claim")
  claim(@Param("userId") userId: string) {
    return { keyPackage: this.service.claim(userId) };
  }

  /** How many single-use KeyPackages remain for a user. */
  @Get(":userId/available")
  available(@Param("userId") userId: string) {
    return { available: this.service.available(userId) };
  }
}
