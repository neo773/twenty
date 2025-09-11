import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';
import { type ObjectLiteral } from 'typeorm';

import { GraphqlQueryFilterConditionParser } from 'src/engine/api/graphql/graphql-query-runner/graphql-query-parsers/graphql-query-filter/graphql-query-filter-condition.parser';
import { buildColumnsToSelect } from 'src/engine/api/graphql/graphql-query-runner/utils/build-columns-to-select';
import { type ObjectMetadataItemWithFieldMaps } from 'src/engine/metadata-modules/types/object-metadata-item-with-field-maps';
import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { getObjectMetadataMapItemByNameSingular } from 'src/engine/metadata-modules/utils/get-object-metadata-map-item-by-name-singular.util';
import { type WorkspaceSelectQueryBuilder } from 'src/engine/twenty-orm/repository/workspace-select-query-builder';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { type PrimitiveValue } from 'src/modules/virtual-fields/types/PrimitiveValue';
import {
  type Condition,
  type PathBasedField,
  type RankingClause,
} from 'src/modules/virtual-fields/types/VirtualField';
import { resolveField } from 'src/modules/virtual-fields/utils/metadata-resolver.util';

type ResolvedPathStep = {
  objectName: string;
  fieldName: string;
};

type PathEvaluationContext = {
  workspaceId: string;
  objectMetadataMaps: ObjectMetadataMaps;
  entityId: string;
};

export type PathEvaluatorResult = {
  value: PrimitiveValue | ObjectLiteral;
  isEntityResult: boolean;
};

@Injectable()
export class VirtualFieldPathEvaluator {
  private readonly logger = new Logger(VirtualFieldPathEvaluator.name);

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
    const context: PathEvaluationContext = {
      workspaceId,
      objectMetadataMaps,
      entityId,
    };

    const resolvedPath = this.resolveFieldPath(
      pathField.path,
      objectMetadataMaps,
    );

    const repository = await this.getRepositoryForObject(
      targetObjectName,
      workspaceId,
    );

    const queryBuilder = repository.createQueryBuilder('root');
    const pathAlias = this.buildPathJoins(queryBuilder, resolvedPath);

    const isEntityResult = this.isEntityReturnType(resolvedPath);

    if (isEntityResult) {
      return this.evaluateEntityResult(
        pathField,
        queryBuilder,
        pathAlias,
        context,
      );
    }

    return this.evaluateAggregateResult(
      pathField,
      queryBuilder,
      resolvedPath,
      pathAlias,
      context,
    );
  }

  private resolveFieldPath(
    fieldPath: string[],
    objectMetadataMaps: ObjectMetadataMaps,
  ): ResolvedPathStep[] {
    const resolvedPath = fieldPath
      .map((fieldId) => resolveField(fieldId, objectMetadataMaps))
      .filter(isDefined);

    if (resolvedPath.length !== fieldPath.length) {
      throw new Error(
        `Could not resolve field path: ${fieldPath.join(' -> ')}`,
      );
    }

    return resolvedPath;
  }

  private async getRepositoryForObject(
    objectName: string,
    workspaceId: string,
  ) {
    return this.twentyORMGlobalManager.getRepositoryForWorkspace(
      workspaceId,
      objectName,
      { shouldBypassPermissionChecks: true },
    );
  }

  private buildPathJoins(
    queryBuilder: WorkspaceSelectQueryBuilder<ObjectLiteral>,
    resolvedPath: ResolvedPathStep[],
  ): string {
    if (resolvedPath.length <= 1) {
      return 'root';
    }

    let currentAlias = 'root';

    for (let i = 0; i < resolvedPath.length - 1; i++) {
      const step = resolvedPath[i];
      const nextStep = resolvedPath[i + 1];
      const nextAlias = nextStep.objectName;

      queryBuilder.leftJoin(`${currentAlias}.${step.fieldName}`, nextAlias);
      currentAlias = nextAlias;
    }

    return currentAlias;
  }

  private getAliasForCondition(
    condition: Condition,
    resolvedPath: ResolvedPathStep[],
    objectMetadataMaps: ObjectMetadataMaps,
  ): string {
    if (!('field' in condition)) {
      return resolvedPath.length > 1
        ? resolvedPath[resolvedPath.length - 1].objectName
        : 'root';
    }

    const resolvedField = resolveField(condition.field, objectMetadataMaps);

    if (!resolvedField) {
      this.logger.warn(`Cannot resolve condition field: ${condition.field}`);

      return resolvedPath.length > 1
        ? resolvedPath[resolvedPath.length - 1].objectName
        : 'root';
    }

    const pathStep = resolvedPath.find(
      (step) => step.objectName === resolvedField.objectName,
    );

    return pathStep ? resolvedField.objectName : 'root';
  }

  private isEntityReturnType(resolvedPath: ResolvedPathStep[]): boolean {
    return resolvedPath.length === 1;
  }

  private async evaluateEntityResult(
    pathField: PathBasedField,
    queryBuilder: WorkspaceSelectQueryBuilder<ObjectLiteral>,
    pathAlias: string,
    context: PathEvaluationContext,
  ): Promise<PathEvaluatorResult> {
    const targetObjectMetadata = this.getTargetObjectMetadata(
      pathAlias,
      context.objectMetadataMaps,
    );

    this.configureEntitySelectFields(
      queryBuilder,
      targetObjectMetadata,
      context.objectMetadataMaps,
    );

    this.applyFieldConditions(
      queryBuilder,
      pathField,
      pathAlias,
      targetObjectMetadata,
      context.objectMetadataMaps,
    );

    this.applyEntityFilter(queryBuilder, context.entityId);

    const entities = await queryBuilder.getMany();

    return {
      value: entities.length > 0 ? entities[0] : null,
      isEntityResult: true,
    };
  }

  private async evaluateAggregateResult(
    pathField: PathBasedField,
    queryBuilder: WorkspaceSelectQueryBuilder<ObjectLiteral>,
    resolvedPath: ResolvedPathStep[],
    pathAlias: string,
    context: PathEvaluationContext,
  ): Promise<PathEvaluatorResult> {
    const targetField = resolvedPath[resolvedPath.length - 1];
    const targetColumnRef = `${pathAlias}.${targetField.fieldName}`;

    this.applyAggregateConditions(
      queryBuilder,
      pathField,
      resolvedPath,
      pathAlias,
      context.objectMetadataMaps,
    );

    this.configureAggregateQuery(
      queryBuilder,
      pathField.calculation,
      targetColumnRef,
      context.entityId,
    );

    const result = await queryBuilder.getRawOne();

    return {
      value: result?.aggregate_result || null,
      isEntityResult: false,
    };
  }

  private configureEntitySelectFields(
    queryBuilder: WorkspaceSelectQueryBuilder<ObjectLiteral>,
    targetObjectMetadata: ObjectMetadataItemWithFieldMaps | null,
    objectMetadataMaps: ObjectMetadataMaps,
  ): void {
    const columnsToSelect = this.buildEntityColumnsToSelect(
      targetObjectMetadata,
      objectMetadataMaps,
    );

    queryBuilder.setFindOptions({ select: columnsToSelect });
  }

  private applyFieldConditions(
    queryBuilder: WorkspaceSelectQueryBuilder<ObjectLiteral>,
    pathField: PathBasedField,
    pathAlias: string,
    targetObjectMetadata: ObjectMetadataItemWithFieldMaps | null,
    objectMetadataMaps: ObjectMetadataMaps,
  ): void {
    if (pathField.where) {
      this.applyConditionFilter(
        queryBuilder,
        pathField.where,
        pathAlias,
        targetObjectMetadata,
        objectMetadataMaps,
      );
    }

    if (pathField.rankBy) {
      this.applyRankingToQuery(
        queryBuilder,
        pathField.rankBy,
        pathAlias,
        targetObjectMetadata,
      );
    }
  }

  private applyAggregateConditions(
    queryBuilder: WorkspaceSelectQueryBuilder<ObjectLiteral>,
    pathField: PathBasedField,
    resolvedPath: ResolvedPathStep[],
    pathAlias: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): void {
    if (pathField.where) {
      const correctAlias = this.getAliasForCondition(
        pathField.where,
        resolvedPath,
        objectMetadataMaps,
      );

      const objectMetadata = this.getTargetObjectMetadata(
        correctAlias,
        objectMetadataMaps,
      );

      this.applyConditionFilter(
        queryBuilder,
        pathField.where,
        correctAlias,
        objectMetadata,
        objectMetadataMaps,
      );
    }
  }

  private configureAggregateQuery(
    queryBuilder: WorkspaceSelectQueryBuilder<ObjectLiteral>,
    calculation: string,
    targetColumnRef: string,
    entityId: string,
  ): void {
    queryBuilder
      .select(`${calculation}(${targetColumnRef})`, 'aggregate_result')
      .andWhere('root.id = :entityId', { entityId });
  }

  private applyEntityFilter(
    queryBuilder: WorkspaceSelectQueryBuilder<ObjectLiteral>,
    entityId: string,
  ): void {
    queryBuilder.andWhere('root.id = :entityId', { entityId });
  }

  private getTargetObjectMetadata(
    pathAlias: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): ObjectMetadataItemWithFieldMaps | null {
    if (pathAlias === 'root') {
      return null;
    }

    return (
      getObjectMetadataMapItemByNameSingular(objectMetadataMaps, pathAlias) ||
      null
    );
  }

  private buildEntityColumnsToSelect(
    objectMetadata: ObjectMetadataItemWithFieldMaps | null,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Record<string, boolean> {
    if (!objectMetadata) {
      return { id: true };
    }

    return buildColumnsToSelect({
      select: {},
      relations: {},
      objectMetadataItemWithFieldMaps: objectMetadata,
      objectMetadataMaps,
    });
  }

  private applyConditionFilter(
    queryBuilder: WorkspaceSelectQueryBuilder<ObjectLiteral>,
    condition: Condition,
    tableAlias: string,
    objectMetadata: ObjectMetadataItemWithFieldMaps | null,
    objectMetadataMaps: ObjectMetadataMaps,
  ): void {
    if (!objectMetadata) {
      this.logger.warn(
        `Cannot apply condition filter: object metadata not found for alias ${tableAlias}`,
      );

      return;
    }

    try {
      const filterParser = new GraphqlQueryFilterConditionParser(
        objectMetadata,
      );

      const mockFilter = this.convertConditionToGraphQLFilter(
        condition,
        objectMetadataMaps,
      );

      filterParser.parse(queryBuilder, tableAlias, mockFilter);
    } catch (error) {
      this.logger.warn(
        `Failed to apply condition filter: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          tableAlias,
          condition,
        },
      );
    }
  }

  private convertConditionToGraphQLFilter(
    condition: Condition,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Record<string, unknown> {
    if ('field' in condition) {
      const resolvedField = resolveField(condition.field, objectMetadataMaps);

      if (!resolvedField) {
        throw new Error(`Cannot resolve field: ${condition.field}`);
      }

      return {
        [resolvedField.fieldName]: {
          [condition.operator]: condition.value,
        },
      };
    }

    if ('and' in condition && condition.and) {
      return {
        and: condition.and.map((subCondition) =>
          this.convertConditionToGraphQLFilter(
            subCondition,
            objectMetadataMaps,
          ),
        ),
      };
    }

    if ('or' in condition && condition.or) {
      return {
        or: condition.or.map((subCondition) =>
          this.convertConditionToGraphQLFilter(
            subCondition,
            objectMetadataMaps,
          ),
        ),
      };
    }

    if ('not' in condition && condition.not) {
      return {
        not: this.convertConditionToGraphQLFilter(
          condition.not,
          objectMetadataMaps,
        ),
      };
    }

    throw new Error(`Unsupported condition type: ${JSON.stringify(condition)}`);
  }

  private applyRankingToQuery(
    queryBuilder: WorkspaceSelectQueryBuilder<ObjectLiteral>,
    ranking: RankingClause,
    tableAlias: string,
    objectMetadata: ObjectMetadataItemWithFieldMaps | null,
  ): void {
    if (ranking.field && objectMetadata) {
      const fieldMetadata = objectMetadata.fieldIdByName[ranking.field];

      if (fieldMetadata) {
        queryBuilder.orderBy(
          `"${tableAlias}"."${ranking.field}"`,
          ranking.direction,
        );
      } else {
        this.logger.warn(
          `Ranking field '${ranking.field}' not found in object metadata, falling back to ID`,
        );
        queryBuilder.orderBy(`${tableAlias}.id`, ranking.direction);
      }
    } else {
      queryBuilder.orderBy(`${tableAlias}.id`, ranking.direction);
    }

    if (ranking.limit) {
      queryBuilder.limit(ranking.limit);
    }
  }
}
