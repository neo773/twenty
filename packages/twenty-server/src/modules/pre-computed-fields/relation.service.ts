// @ts-nocheck
import { Logger } from '@nestjs/common';

import { FieldMetadataType } from 'twenty-shared/types';
import { In } from 'typeorm';

import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { type TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { type WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';

export class RelationsService {
  private readonly logger = new Logger(RelationsService.name);

  constructor(
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
    private readonly workspaceCacheStorageService: WorkspaceCacheStorageService,
  ) {
    // immediate test
    this.test();
  }

  async test() {
    try {
      // 1. Find all companies related to this calendar event
      const relatedCompanies = await this.findRelatedEntities({
        sourceObjectName: 'calendarEvent',
        sourceEntityId: '7df9767e-92bd-4da6-909a-2e3ef75968ae',
        targetObjectName: 'company',
        workspaceId: '3b8e6458-5fc1-4e63-8563-008ccddaa6db',
      });

      console.log(
        'Companies related to this calendar event:',
        relatedCompanies,
      );
    } catch (error) {
      console.error('Error:', error);
    }
  }

  /**
   * Find all entities of targetObjectType that are related to sourceEntityId
   * Works for ANY object types - completely dynamic!
   */
  async findRelatedEntities({
    sourceObjectName,
    sourceEntityId,
    targetObjectName,
    workspaceId,
  }: {
    sourceObjectName: string; // e.g., 'calendarEvent', 'emailMessage', 'person'
    sourceEntityId: string;
    targetObjectName: string; // e.g., 'company', 'person', 'opportunity'
    workspaceId: string;
  }): Promise<string[]> {
    this.logger.log('Finding related entities:', {
      sourceObjectName,
      sourceEntityId,
      targetObjectName,
      workspaceId,
    });

    // 1. Get all object metadata
    const objectMetadataMaps =
      await this.workspaceCacheStorageService.getObjectMetadataMapsOrThrow(
        workspaceId,
      );

    // 2. Find relationship path from source to target
    const relationshipPath = this.findRelationshipPath(
      sourceObjectName,
      targetObjectName,
      objectMetadataMaps,
    );

    if (!relationshipPath.length) {
      this.logger.warn(
        `No relationship path found from ${sourceObjectName} to ${targetObjectName}`,
      );

      return [];
    }

    this.logger.log('Found relationship path:', {
      pathLength: relationshipPath.length,
      path: relationshipPath.map((step) => ({
        from: step.sourceObjectName,
        to: step.targetObjectName,
        via: step.fieldName,
        type: step.relationType,
      })),
    });

    // 3. Execute the traversal
    const relatedEntityIds = await this.executeRelationshipTraversal(
      sourceEntityId,
      relationshipPath,
      objectMetadataMaps,
      workspaceId,
    );

    this.logger.log(
      `Found ${relatedEntityIds.length} related ${targetObjectName} entities`,
    );

    return relatedEntityIds;
  }

  /**
   * Build relationship graph and find path using BFS
   */
  private findRelationshipPath(
    sourceObjectName: string,
    targetObjectName: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): RelationshipStep[] {
    // Build complete relationship graph
    const relationshipGraph = this.buildRelationshipGraph(objectMetadataMaps);

    // BFS to find shortest path
    const queue: Array<{ objectName: string; path: RelationshipStep[] }> = [
      { objectName: sourceObjectName, path: [] },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const { objectName, path } = current;

      if (visited.has(objectName)) continue;
      visited.add(objectName);

      // Found target!
      if (objectName === targetObjectName) {
        return path;
      }

      // Explore all outgoing relationships
      const outgoingRelations = relationshipGraph.get(objectName) || [];

      for (const relation of outgoingRelations) {
        if (!visited.has(relation.targetObjectName)) {
          queue.push({
            objectName: relation.targetObjectName,
            path: [...path, relation],
          });
        }
      }
    }

    return []; // No path found
  }

  /**
   * Build complete relationship graph from metadata
   */
  private buildRelationshipGraph(
    objectMetadataMaps: ObjectMetadataMaps,
  ): Map<string, RelationshipStep[]> {
    const graph = new Map<string, RelationshipStep[]>();

    // For each object in the workspace
    for (const [objectId, objectMetadata] of Object.entries(
      objectMetadataMaps.byId,
    )) {
      if (!objectMetadata) continue;

      const relationships: RelationshipStep[] = [];

      // For each field in this object
      for (const [fieldId, fieldMetadata] of Object.entries(
        objectMetadata.fieldsById,
      )) {
        if (
          fieldMetadata.type === FieldMetadataType.RELATION &&
          fieldMetadata.relationTargetObjectMetadataId &&
          fieldMetadata.settings?.relationType
        ) {
          const targetObjectMetadata =
            objectMetadataMaps.byId[
              fieldMetadata.relationTargetObjectMetadataId
            ];

          if (targetObjectMetadata) {
            // Add forward relationship
            relationships.push({
              fieldName: fieldMetadata.name,
              sourceObjectName: objectMetadata.nameSingular,
              targetObjectName: targetObjectMetadata.nameSingular,
              relationType: fieldMetadata.settings.relationType as
                | 'ONE_TO_MANY'
                | 'MANY_TO_ONE',
              joinColumnName: fieldMetadata.settings.joinColumnName,
              isForward: true,
            });

            // Add inverse relationship for bidirectional traversal
            if (!graph.has(targetObjectMetadata.nameSingular)) {
              graph.set(targetObjectMetadata.nameSingular, []);
            }

            const inverseRelationType =
              fieldMetadata.settings.relationType === 'ONE_TO_MANY'
                ? 'MANY_TO_ONE'
                : 'ONE_TO_MANY';

            graph.get(targetObjectMetadata.nameSingular)!.push({
              fieldName: fieldMetadata.name,
              sourceObjectName: targetObjectMetadata.nameSingular,
              targetObjectName: objectMetadata.nameSingular,
              relationType: inverseRelationType as
                | 'ONE_TO_MANY'
                | 'MANY_TO_ONE',
              joinColumnName: fieldMetadata.settings.joinColumnName,
              isForward: false,
            });
          }
        }
      }

      graph.set(objectMetadata.nameSingular, relationships);
    }

    return graph;
  }

  /**
   * Execute the relationship traversal step by step
   */
  private async executeRelationshipTraversal(
    startEntityId: string,
    relationshipPath: RelationshipStep[],
    objectMetadataMaps: ObjectMetadataMaps,
    workspaceId: string,
  ): Promise<string[]> {
    let currentEntityIds = [startEntityId];

    // Follow each step in the path
    for (let i = 0; i < relationshipPath.length; i++) {
      const step = relationshipPath[i];

      this.logger.log(`Traversal step ${i + 1}:`, {
        from: step.sourceObjectName,
        to: step.targetObjectName,
        field: step.fieldName,
        type: step.relationType,
        isForward: step.isForward,
        currentEntityCount: currentEntityIds.length,
      });

      if (currentEntityIds.length === 0) break;

      const nextEntityIds = await this.executeRelationshipStep(
        currentEntityIds,
        step,
        objectMetadataMaps,
        workspaceId,
      );

      currentEntityIds = [...new Set(nextEntityIds)]; // Remove duplicates
    }

    return currentEntityIds;
  }

  /**
   * Execute a single relationship step
   */
  private async executeRelationshipStep(
    currentEntityIds: string[],
    step: RelationshipStep,
    objectMetadataMaps: ObjectMetadataMaps,
    workspaceId: string,
  ): Promise<string[]> {
    const sourceRepository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace(
        workspaceId,
        step.sourceObjectName,
        { shouldBypassPermissionChecks: true },
      );

    if (step.isForward) {
      // Forward relationship
      if (step.relationType === 'MANY_TO_ONE' && step.joinColumnName) {
        // Get related entity IDs via join column
        const results = await sourceRepository.find({
          where: { id: In(currentEntityIds) },
          select: { [step.joinColumnName]: true },
        });

        return results.map((r: any) => r[step.joinColumnName]).filter(Boolean);
      } else if (step.relationType === 'ONE_TO_MANY') {
        // Get related entities via relationship
        const queryBuilder = sourceRepository
          .createQueryBuilder('entity')
          .select(`related.id`)
          .innerJoin(`entity.${step.fieldName}`, 'related')
          .where('entity.id IN (:...ids)', { ids: currentEntityIds });

        const results = await queryBuilder.getRawMany();

        return results.map((r: any) => r.related_id);
      }
    } else {
      // Inverse relationship
      if (step.relationType === 'MANY_TO_ONE' && step.joinColumnName) {
        // Find entities that reference current entities
        const results = await sourceRepository.find({
          where: { [step.joinColumnName]: In(currentEntityIds) },
          select: { id: true },
        });

        return results.map((r: any) => r.id);
      } else if (step.relationType === 'ONE_TO_MANY') {
        // Find entities through inverse relationship
        const queryBuilder = sourceRepository
          .createQueryBuilder('entity')
          .select('entity.id')
          .innerJoin(`entity.${step.fieldName}`, 'related')
          .where('related.id IN (:...ids)', { ids: currentEntityIds });

        const results = await queryBuilder.getRawMany();

        return results.map((r: any) => r.entity_id);
      }
    }

    return [];
  }
}

interface RelationshipStep {
  fieldName: string;
  sourceObjectName: string;
  targetObjectName: string;
  relationType: 'ONE_TO_MANY' | 'MANY_TO_ONE';
  joinColumnName?: string;
  isForward: boolean;
}
