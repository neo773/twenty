import { Injectable, Logger } from '@nestjs/common';

import { SelectQueryBuilder } from 'typeorm';

import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { Direction } from 'src/modules/computed-fields/types/Direction';
import { type PrimitiveValue } from 'src/modules/computed-fields/types/PrimitiveValue';
import {
  type PathBasedField,
  type RankingClause,
} from 'src/modules/computed-fields/types/VirtualField';
import { ExpressionEvaluatorService } from 'src/modules/pre-computed-fields/services/expression-evaluator.service';
import { RankingService } from 'src/modules/pre-computed-fields/services/ranking.service';
import { buildColumnReference } from 'src/modules/pre-computed-fields/utils/build-column-reference.util';
import { buildTableAlias } from 'src/modules/pre-computed-fields/utils/build-table-alias.util';
import { resolveFieldPath } from 'src/modules/pre-computed-fields/utils/resolve-field-path.util';

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
export class PathEvaluatorService {
  private readonly logger = new Logger(PathEvaluatorService.name);

  constructor(
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
    private readonly expressionEvaluatorService: ExpressionEvaluatorService,
    private readonly rankingService: RankingService,
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
      const nextAlias = buildTableAlias(step.objectName, i + 1);

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
        const whereSQL = this.expressionEvaluatorService.generateConditionalSQL(
          {
            when: [{ condition: pathField.where, value: true }],
            default: false,
          },
          objectMetadataMaps,
          currentAlias,
        );

        queryBuilder.andWhere(`(${whereSQL}) = true`);
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
    const targetColumnRef = buildColumnReference(
      currentAlias,
      targetField.fieldName,
    );

    if (pathField.where) {
      const whereSQL = this.expressionEvaluatorService.generateConditionalSQL(
        {
          when: [{ condition: pathField.where, value: true }],
          default: false,
        },
        objectMetadataMaps,
        currentAlias,
      );

      queryBuilder.andWhere(`(${whereSQL}) = true`);
    }

    const aggregateColumn = this.buildAggregateExpression(
      pathField.calculation,
      targetColumnRef,
    );

    queryBuilder
      .select(aggregateColumn, 'aggregate_result')
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
      this.rankingService.applyRankingToQuery(
        queryBuilder,
        ranking,
        ranking.field,
        tableAlias,
        objectMetadataMaps,
      );
    } else {
      queryBuilder
        .orderBy(
          `${tableAlias}.id`,
          ranking.direction.toUpperCase() as 'ASC' | 'DESC',
        )
        .limit(ranking.limit);
    }
  }

  private async evaluateEntityResultWithCalculationRanking(
    pathField: PathBasedField,
    entityId: string,
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
    resolvedPath: ResolvedPathStep[],
  ): Promise<PathEvaluatorResult> {
    const targetObjectName = resolvedPath[0].objectName;
    const repository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace(
        workspaceId,
        targetObjectName,
        { shouldBypassPermissionChecks: true },
      );

    const entitiesQueryBuilder = repository.createQueryBuilder('root');

    entitiesQueryBuilder.andWhere('root.id = :entityId', { entityId });

    let currentAlias = 'root';

    for (let i = 0; i < resolvedPath.length - 1; i++) {
      const step = resolvedPath[i];
      const nextAlias = buildTableAlias(step.objectName, i + 1);

      entitiesQueryBuilder.leftJoin(
        `${currentAlias}.${step.fieldName}`,
        nextAlias,
      );
      currentAlias = nextAlias;
    }

    entitiesQueryBuilder.select(`${currentAlias}.*`);

    if (pathField.where) {
      const whereSQL = this.expressionEvaluatorService.generateConditionalSQL(
        {
          when: [{ condition: pathField.where, value: true }],
          default: false,
        },
        objectMetadataMaps,
        currentAlias,
      );

      entitiesQueryBuilder.andWhere(`(${whereSQL}) = true`);
    }

    const entities = await entitiesQueryBuilder.getMany();

    if (entities.length === 0) {
      return { value: null, isEntityResult: true };
    }

    const entitiesWithRankingValues = await Promise.all(
      entities.map(async (entity) => {
        const rankingValue = await this.calculateRankingValueForEntity(
          entity,
          pathField,
          workspaceId,
          objectMetadataMaps,
        );

        return { entity, rankingValue };
      }),
    );

    entitiesWithRankingValues.sort((a, b) => {
      const aValue = a.rankingValue;
      const bValue = b.rankingValue;

      if (aValue === null && bValue === null) return 0;
      if (aValue === null)
        return pathField.rankBy!.direction === Direction.DESC ? 1 : -1;
      if (bValue === null)
        return pathField.rankBy!.direction === Direction.DESC ? -1 : 1;

      if (pathField.rankBy!.direction === Direction.DESC) {
        return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
      } else {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }
    });

    const limit = pathField.rankBy!.limit || 1;
    const topEntity =
      entitiesWithRankingValues.slice(0, limit)[0]?.entity || null;

    return {
      value: topEntity,
      isEntityResult: true,
    };
  }

  private async calculateRankingValueForEntity(
    entity: EntityRecord,
    pathField: PathBasedField,
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<PrimitiveValue> {
    const resolvedPath = resolveFieldPath(pathField.path, objectMetadataMaps);

    if (!resolvedPath || resolvedPath.length === 0) {
      return 0;
    }

    const entityObjectName = resolvedPath[0].objectName;

    const repository =
      await this.twentyORMGlobalManager.getRepositoryForWorkspace(
        workspaceId,
        entityObjectName,
        { shouldBypassPermissionChecks: true },
      );

    const queryBuilder = repository.createQueryBuilder('target');

    queryBuilder.andWhere('target.id = :entityId', { entityId: entity.id });

    if (pathField.path.length > 1) {
      const remainingPath = resolvedPath.slice(1);

      let currentAlias = 'target';

      for (let i = 0; i < remainingPath.length - 1; i++) {
        const step = remainingPath[i];
        const nextAlias = buildTableAlias(step.objectName, i + 1);

        queryBuilder.leftJoin(`${currentAlias}.${step.fieldName}`, nextAlias);
        currentAlias = nextAlias;
      }

      if (pathField.where) {
        const whereSQL = this.expressionEvaluatorService.generateConditionalSQL(
          {
            when: [{ condition: pathField.where, value: true }],
            default: false,
          },
          objectMetadataMaps,
          currentAlias,
        );

        queryBuilder.andWhere(`(${whereSQL}) = true`);
      }

      const targetField = remainingPath[remainingPath.length - 1];
      const targetColumnRef = buildColumnReference(
        currentAlias,
        targetField.fieldName,
      );
      const aggregateColumn = this.buildAggregateExpression(
        pathField.calculation,
        targetColumnRef,
      );

      queryBuilder.select(aggregateColumn, 'ranking_value');
    } else {
      if (pathField.calculation === 'COUNT') {
        queryBuilder.select('COUNT(target.id)', 'ranking_value');
      } else {
        queryBuilder.select('1', 'ranking_value');
      }
    }

    try {
      const result = await queryBuilder.getRawOne();

      return result?.ranking_value || 0;
    } catch (error) {
      this.logger.error(
        `Error calculating ranking value for entity ${entity.id}:`,
        error,
      );

      return 0;
    }
  }

  private buildAggregateExpression(
    operation: string,
    columnRef: string,
  ): string {
    switch (operation) {
      case 'MIN':
        return `MIN(${columnRef})`;
      case 'MAX':
        return `MAX(${columnRef})`;
      case 'AVG':
        return `AVG(${columnRef})`;
      case 'SUM':
        return `SUM(${columnRef})`;
      case 'COUNT':
        return `COUNT(${columnRef})`;
      case 'COUNT_UNIQUE_VALUES':
        return `COUNT(DISTINCT ${columnRef})`;
      case 'COUNT_EMPTY':
        return `COUNT(*) - COUNT(${columnRef})`;
      case 'COUNT_NOT_EMPTY':
        return `COUNT(${columnRef})`;
      case 'COUNT_TRUE':
        return `COUNT(CASE WHEN ${columnRef}::boolean = TRUE THEN 1 ELSE NULL END)`;
      case 'COUNT_FALSE':
        return `COUNT(CASE WHEN ${columnRef}::boolean = FALSE THEN 1 ELSE NULL END)`;
      case 'PERCENTAGE_EMPTY':
        return `CASE WHEN COUNT(*) = 0 THEN NULL ELSE CAST(((COUNT(*) - COUNT(${columnRef}))::decimal / COUNT(*)) AS DECIMAL) END`;
      case 'PERCENTAGE_NOT_EMPTY':
        return `CASE WHEN COUNT(*) = 0 THEN NULL ELSE CAST((COUNT(${columnRef})::decimal / COUNT(*)) AS DECIMAL) END`;
      default:
        throw new Error(`Unsupported aggregate operation: ${operation}`);
    }
  }
}
