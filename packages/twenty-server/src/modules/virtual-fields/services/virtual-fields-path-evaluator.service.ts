import { Injectable, Logger } from '@nestjs/common';

import { SelectQueryBuilder } from 'typeorm';

import { computeWhereConditionParts } from 'src/engine/api/graphql/graphql-query-runner/utils/compute-where-condition-parts';
import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { type PrimitiveValue } from 'src/modules/computed-fields/types/PrimitiveValue';
import {
  type Condition,
  type PathBasedField,
  type RankingClause,
} from 'src/modules/computed-fields/types/VirtualField';
import { resolveFieldPath } from 'src/modules/virtual-fields/utils/resolve-field-path.util';
import { resolveField } from 'src/modules/virtual-fields/utils/metadata-resolver.util';

type ResolvedPathStep = {
  objectName: string;
  fieldName: string;
};

type EntityRecord = Record<string, PrimitiveValue>;

export type PathEvaluatorResult = {
  value: PrimitiveValue | EntityRecord;
  isEntityResult: boolean;
};

@Injectable()
export class VirtualFieldsPathEvaluatorService {
  private readonly logger = new Logger(VirtualFieldsPathEvaluatorService.name);

  constructor(
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
  ) {}

  async evaluatePathBasedField(
    pathField: PathBasedField,
    entityId: string,
    targetObjectName: string,
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<PathEvaluatorResult> {
    const repository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace(
        workspaceId,
        targetObjectName,
        { shouldBypassPermissionChecks: true },
      );

    const queryBuilder = repository.createQueryBuilder('root');
    const resolvedPath = resolveFieldPath(pathField.path, objectMetadataMaps);

    if (!resolvedPath) {
      throw new Error(
        `Could not resolve field path: ${pathField.path.join(' -> ')}`,
      );
    }

    let currentAlias = 'root';

    for (let i = 0; i < resolvedPath.length - 1; i++) {
      const step = resolvedPath[i];
      const nextAlias = `${step.objectName}_${i + 1}`;

      queryBuilder.leftJoin(`${currentAlias}.${step.fieldName}`, nextAlias);
      currentAlias = nextAlias;
    }

    const isEntityResult = this.isEntityReturn(resolvedPath);

    if (isEntityResult) {
      if (pathField.rankBy && !pathField.rankBy.field) {
        return await this.evaluateEntityResultWithCalculationRanking(
          pathField,
          entityId,
          workspaceId,
          objectMetadataMaps,
          resolvedPath,
        );
      }

      queryBuilder.select(`${currentAlias}.*`);

      if (pathField.where) {
        this.applyConditionToQuery(
          queryBuilder,
          pathField.where,
          resolvedPath,
          objectMetadataMaps,
        );
      }

      if (pathField.rankBy) {
        this.applyRanking(
          queryBuilder,
          pathField.rankBy,
          currentAlias,
          objectMetadataMaps,
        );
      }

      queryBuilder.andWhere('root.id = :entityId', { entityId });
      const entities = await queryBuilder.getMany();

      return {
        value: entities.length > 0 ? entities[0] : null,
        isEntityResult: true,
      };
    }

    const targetField = resolvedPath[resolvedPath.length - 1];
    const targetColumnRef = `${currentAlias}.${targetField.fieldName}`;

    if (pathField.where) {
      this.applyConditionToQuery(
        queryBuilder,
        pathField.where,
        resolvedPath,
        objectMetadataMaps,
      );
    }

    queryBuilder
      .select(
        `${pathField.calculation}(${targetColumnRef})`,
        'aggregate_result',
      )
      .andWhere('root.id = :entityId', { entityId });

    const result = await queryBuilder.getRawOne();

    return {
      value: result?.aggregate_result || null,
      isEntityResult: false,
    };
  }

  private isEntityReturn(resolvedPath: ResolvedPathStep[]): boolean {
    return resolvedPath.length === 1;
  }

  private applyRanking(
    queryBuilder: SelectQueryBuilder<EntityRecord>,
    ranking: RankingClause,
    tableAlias: string,
    objectMetadataMaps?: ObjectMetadataMaps,
  ): void {
    if (ranking.field && objectMetadataMaps) {
      queryBuilder.orderBy(
        `"${tableAlias}"."${ranking.field}"`,
        ranking.direction,
      );
    } else {
      queryBuilder.orderBy(`${tableAlias}.id`, ranking.direction);
    }

    queryBuilder.limit(ranking.limit);
  }

  private async evaluateEntityResultWithCalculationRanking(
    pathField: PathBasedField,
    entityId: string,
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
    resolvedPath: ResolvedPathStep[],
  ): Promise<PathEvaluatorResult> {
    // Use database-level ORDER BY + LIMIT instead of manual JavaScript sorting
    const targetObjectName = resolvedPath[0].objectName;
    const repository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace(
        workspaceId,
        targetObjectName,
        { shouldBypassPermissionChecks: true },
      );

    const queryBuilder = repository.createQueryBuilder('root');

    queryBuilder.andWhere('root.id = :entityId', { entityId });

    let currentAlias = 'root';

    for (let i = 0; i < resolvedPath.length - 1; i++) {
      const step = resolvedPath[i];
      const nextAlias = `${step.objectName}_${i + 1}`;

      queryBuilder.leftJoin(`${currentAlias}.${step.fieldName}`, nextAlias);
      currentAlias = nextAlias;
    }

    queryBuilder.select(`${currentAlias}.*`);

    if (pathField.where) {
      this.applyConditionToQuery(
        queryBuilder,
        pathField.where,
        resolvedPath,
        objectMetadataMaps,
      );
    }

    // Apply ranking at database level - much more efficient
    if (pathField.rankBy) {
      this.applyRanking(
        queryBuilder,
        pathField.rankBy,
        currentAlias,
        objectMetadataMaps,
      );
    }

    const entities = await queryBuilder.getMany();

    return {
      value: entities.length > 0 ? entities[0] : null,
      isEntityResult: true,
    };
  }

  private applyConditionToQuery(
    queryBuilder: SelectQueryBuilder<EntityRecord>,
    condition: Condition,
    resolvedPath: ResolvedPathStep[],
    objectMetadataMaps: ObjectMetadataMaps,
  ): void {
    // Simplified: Only handle basic field conditions for now
    // Complex logical conditions (and/or/not) should be handled by Twenty's GraphqlQueryFilterFieldParser
    if ('field' in condition) {
      const resolvedField = resolveField(
        condition.field,
        objectMetadataMaps,
      );

      if (resolvedField) {
        // Find the correct table alias: we need to find which step creates a JOIN TO our field's object
        let tableAlias = 'root'; // Default to root

        // Special case: if it's the root object
        if (resolvedPath[0]?.objectName === resolvedField.objectName) {
          tableAlias = 'root';
        } else {
          // Find which step creates a JOIN TO our field's object
          // Step i creates alias buildTableAlias(step.objectName, i+1) that points to the TARGET of that step
          for (let i = 0; i < resolvedPath.length - 1; i++) {
            const step = resolvedPath[i];
            // We need to check what object this step's field points to
            // For now, use a simple heuristic: the step AFTER this one should be our target
            const nextStep = resolvedPath[i + 1];

            if (nextStep && nextStep.objectName === resolvedField.objectName) {
              tableAlias = `${step.objectName}_${i + 1}`;
              break;
            }
          }
        }

        const { sql, params } = computeWhereConditionParts({
          operator: condition.operator,
          objectNameSingular: tableAlias,
          key: resolvedField.fieldName,
          value: condition.value,
        });

        queryBuilder.andWhere(sql, params);
      }
    }
    // TODO: For complex logical conditions, use Twenty's existing GraphQL filter infrastructure
  }
}
