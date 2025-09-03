import { Injectable, Logger } from '@nestjs/common';

import { SelectQueryBuilder } from 'typeorm';

import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { type AllStandardFieldIds } from 'src/modules/computed-fields/types/AllStandardFieldIds';
import { Direction } from 'src/modules/computed-fields/types/Direction';
import { type PrimitiveValue } from 'src/modules/computed-fields/types/PrimitiveValue';
import { type RankingClause } from 'src/modules/computed-fields/types/VirtualField';
import { resolveFieldId } from 'src/modules/pre-computed-fields/utils/resolve-field-id.util';
import { resolveStandardFieldId } from 'src/modules/pre-computed-fields/utils/resolve-standard-field-id.util';

type EntityRecord = Record<string, PrimitiveValue>;

type RankingValue = number | string | Date | null;

type EntityWithRanking = {
  entity: EntityRecord;
  rankingValue: RankingValue;
};

type EntityWithScore = {
  entity: EntityRecord;
  compositeScore: number;
};

export type RankingCriteria = {
  field: AllStandardFieldIds;
  direction: Direction;
  limit: number;
};

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor() {}

  async rankEntities(
    entities: EntityRecord[],
    ranking: RankingClause,
    rankingCriteria: RankingCriteria,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<EntityRecord[]> {
    if (entities.length === 0) {
      return [];
    }

    const entitiesWithRanking: EntityWithRanking[] = entities.map((entity) => ({
      entity,
      rankingValue: this.calculateRankingValue(
        entity,
        rankingCriteria,
        objectMetadataMaps,
      ),
    }));

    entitiesWithRanking.sort((a, b) => {
      const aValue = a.rankingValue;
      const bValue = b.rankingValue;

      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return ranking.direction === Direction.DESC ? 1 : -1;
      if (bValue === null) return ranking.direction === Direction.DESC ? -1 : 1;

      if (ranking.direction === Direction.DESC) {
        return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
      } else {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }
    });

    const limitedEntities = entitiesWithRanking.slice(0, ranking.limit);

    return limitedEntities.map((item) => item.entity);
  }

  applyRankingToQuery(
    queryBuilder: SelectQueryBuilder<EntityRecord>,
    ranking: RankingClause,
    rankingField: AllStandardFieldIds,
    tableAlias: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): void {
    const fieldResolution =
      resolveStandardFieldId(rankingField, objectMetadataMaps) ||
      resolveFieldId(rankingField, objectMetadataMaps);

    if (!fieldResolution) {
      this.logger.warn(
        `Could not resolve ranking field: ${rankingField}, using ID instead`,
      );
      queryBuilder
        .orderBy(
          `${tableAlias}.id`,
          ranking.direction.toUpperCase() as 'ASC' | 'DESC',
        )
        .limit(ranking.limit);

      return;
    }

    const orderByField = `${tableAlias}.${fieldResolution.fieldName}`;

    queryBuilder
      .orderBy(orderByField, ranking.direction.toUpperCase() as 'ASC' | 'DESC')
      .limit(ranking.limit);
  }

  private calculateRankingValue(
    entity: EntityRecord,
    criteria: RankingCriteria,
    objectMetadataMaps: ObjectMetadataMaps,
  ): RankingValue {
    const fieldResolution =
      resolveStandardFieldId(criteria.field, objectMetadataMaps) ||
      resolveFieldId(criteria.field, objectMetadataMaps);

    if (!fieldResolution) {
      this.logger.warn(`Could not resolve ranking field: ${criteria.field}`);

      return null;
    }

    return (entity[fieldResolution.fieldName] as RankingValue) || null;
  }

  createConnectionStrengthRanking(
    interactionCountField: AllStandardFieldIds,
    direction: Direction = Direction.DESC,
    limit: number = 1,
  ): RankingCriteria {
    return {
      field: interactionCountField,
      direction,
      limit,
    };
  }

  createDateBasedRanking(
    dateField: AllStandardFieldIds,
    direction: Direction = Direction.DESC,
    limit: number = 1,
  ): RankingCriteria {
    return {
      field: dateField,
      direction,
      limit,
    };
  }

  createNumericRanking(
    numericField: AllStandardFieldIds,
    direction: Direction = Direction.DESC,
    limit: number = 1,
  ): RankingCriteria {
    return {
      field: numericField,
      direction,
      limit,
    };
  }

  async rankEntitiesMultiCriteria(
    entities: EntityRecord[],
    criteriaList: RankingCriteria[],
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<EntityRecord[]> {
    if (entities.length === 0 || criteriaList.length === 0) {
      return entities;
    }

    const entitiesWithScores: EntityWithScore[] = entities.map((entity) => {
      let compositeScore = 0;
      let validCriteriaCount = 0;

      for (const criteria of criteriaList) {
        const value = this.calculateRankingValue(
          entity,
          criteria,
          objectMetadataMaps,
        );

        if (value !== null) {
          const normalizedValue = this.normalizeValueForScoring(value);

          if (normalizedValue !== null) {
            compositeScore +=
              criteria.direction === Direction.DESC
                ? normalizedValue
                : -normalizedValue;
            validCriteriaCount++;
          }
        }
      }

      return {
        entity,
        compositeScore:
          validCriteriaCount > 0 ? compositeScore / validCriteriaCount : 0,
      };
    });

    entitiesWithScores.sort((a, b) => b.compositeScore - a.compositeScore);

    const limit = criteriaList[0]?.limit || entities.length;

    return entitiesWithScores.slice(0, limit).map((item) => item.entity);
  }

  private normalizeValueForScoring(value: RankingValue): number | null {
    if (typeof value === 'number') {
      return value;
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === 'string') {
      return value.length;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    return null;
  }
}
