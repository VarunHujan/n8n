import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WorkflowsController } from './controllers/workflows.controller';
import { AuthController } from './controllers/auth.controller';
import { DagWalkerService } from './engine/dag-walker.service';
import { PrismaService } from './prisma.service';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController, WorkflowsController, AuthController],
  providers: [AppService, DagWalkerService, PrismaService, WorkflowsService],
})
export class AppModule {}
