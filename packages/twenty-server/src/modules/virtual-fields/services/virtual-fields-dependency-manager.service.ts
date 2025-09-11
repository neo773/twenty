import { Injectable, Logger } from '@nestjs/common';

import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import {
  VirtualFieldsDependencyMapService,
} from 'src/modules/virtual-fields/services/virtual-fields-dependency-map.service';
import { VirtualFieldDependencyMap } from 'src/modules/virtual-fields/types/DependencyMap';

@Injectable()
export class VirtualFieldsDependencyManagerService {
  private readonly logger = new Logger(VirtualFieldsDependencyManagerService.name);

  constructor(
    private readonly workspaceCacheStorageService: WorkspaceCacheStorageService,
    private readonly dependencyMapService: VirtualFieldsDependencyMapService,
  ) {}

  async getDependencyMap(
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<VirtualFieldDependencyMap> {
    const cachedDependencyMap =
      await this.workspaceCacheStorageService.getVirtualFieldDependencyMap(
        workspaceId,
      );

    if (cachedDependencyMap) {
      this.logger.debug('Using cached virtual field dependency map', {
        workspaceId,
        fieldCount: Object.keys(cachedDependencyMap).length,
      });

      return cachedDependencyMap;
    }

    this.logger.log('Building new virtual field dependency map', {
      workspaceId,
    });

    return this.buildAndCacheDependencyMap(workspaceId, objectMetadataMaps);
  }

  async rebuildDependencyMap(
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<VirtualFieldDependencyMap> {
    this.logger.log('Rebuilding dependency map for workspace', {
      workspaceId,
    });

    return this.buildAndCacheDependencyMap(workspaceId, objectMetadataMaps);
  }

  getAffectedVirtualFields(
    objectNameSingular: string,
    dependencyMap: VirtualFieldDependencyMap,
  ): string[] {
    const affectedFields: string[] = [];

    for (const [fieldKey, dependencies] of Object.entries(dependencyMap)) {
      if (
        dependencies.dependenciesObjectNameSingular.includes(objectNameSingular)
      ) {
        affectedFields.push(fieldKey);
      }
    }

    return affectedFields;
  }

  private async buildAndCacheDependencyMap(
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<VirtualFieldDependencyMap> {
    this.logger.log('Starting to build and cache dependency map', {
      workspaceId,
    });

    try {
      const dependencyMap = this.dependencyMapService.buildDependencyMap(
        objectMetadataMaps,
      );

      this.logger.log('Built complete dependency map', {
        workspaceId,
        fieldCount: Object.keys(dependencyMap).length,
      });

      await this.workspaceCacheStorageService.setVirtualFieldDependencyMap(
        workspaceId,
        dependencyMap,
      );

      this.logger.log('Successfully cached virtual field dependency map', {
        workspaceId,
        fieldCount: Object.keys(dependencyMap).length,
      });

      return dependencyMap;
    } catch (error) {
      this.logger.error('Failed to build and cache dependency map', {
        workspaceId,
        error,
      });

      return this.dependencyMapService.buildDependencyMap(
        objectMetadataMaps,
      );
    }
  }
}
