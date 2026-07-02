import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WorkflowsController } from './controllers/workflows.controller';
import { DagWalkerService } from './engine/dag-walker.service';

@Module({
  imports: [],
  controllers: [AppController, WorkflowsController],
  providers: [AppService, DagWalkerService],
})
export class AppModule {}
