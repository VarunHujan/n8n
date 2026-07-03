import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WorkflowsController } from './controllers/workflows.controller';
import { AuthController } from './controllers/auth.controller';
import { DagWalkerService } from './engine/dag-walker.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController, WorkflowsController, AuthController],
  providers: [AppService, DagWalkerService],
})
export class AppModule {}
