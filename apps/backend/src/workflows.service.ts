import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const list = await this.prisma.workflow.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return list;
  }

  async findOne(id: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow with ID ${id} not found`);
    }

    return {
      id: workflow.id,
      name: workflow.name,
      nodes: JSON.parse(workflow.nodes),
      edges: JSON.parse(workflow.edges),
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }

  async createOrUpdate(id: string, name: string, nodes: any[], edges: any[]) {
    const nodesStr = JSON.stringify(nodes);
    const edgesStr = JSON.stringify(edges);

    // Upsert behavior: search by id
    const workflow = await this.prisma.workflow.upsert({
      where: { id: id || '' },
      update: {
        name,
        nodes: nodesStr,
        edges: edgesStr,
      },
      create: {
        id: id || undefined, // Prisma auto-generates uuid if undefined or not supplied
        name,
        nodes: nodesStr,
        edges: edgesStr,
      },
    });

    return {
      id: workflow.id,
      name: workflow.name,
      nodes: JSON.parse(workflow.nodes),
      edges: JSON.parse(workflow.edges),
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }

  async delete(id: string) {
    try {
      const deleted = await this.prisma.workflow.delete({
        where: { id },
      });
      return { success: true, id: deleted.id };
    } catch (error) {
      throw new NotFoundException(`Workflow with ID ${id} not found or could not be deleted`);
    }
  }
}
