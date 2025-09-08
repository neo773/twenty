import { Injectable, Logger } from '@nestjs/common';

import { type ObjectMetadataMaps } from 'src/engine/metadata-modules/types/object-metadata-maps';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import {
  VirtualFieldsDependencyService,
  type VirtualFieldDependencyMap,
} from 'src/modules/virtual-fields/services/virtual-fields-dependency.service';

@Injectable()
export class VirtualFieldsCacheService {
  private readonly logger = new Logger(VirtualFieldsCacheService.name);

  constructor(
    private readonly workspaceCacheStorageService: WorkspaceCacheStorageService,
    private readonly virtualFieldsDependencyService: VirtualFieldsDependencyService,
  ) {}

  async getDependencyMapForWorkspace(
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<VirtualFieldDependencyMap> {
    const metadataVersion =
      await this.workspaceCacheStorageService.getMetadataVersion(workspaceId);

    if (!metadataVersion) {
      this.logger.debug(
        'No metadata version found, building dependency map without cache',
        { workspaceId },
      );

      return this.buildAndCacheDependencyMap(
        workspaceId,
        objectMetadataMaps,
        1,
      );
    }

    const cachedDependencyMap =
      await this.workspaceCacheStorageService.getVirtualFieldDependencyMap(
        workspaceId,
        metadataVersion,
      );

    if (cachedDependencyMap) {
      this.logger.debug('Using cached virtual field dependency map', {
        workspaceId,
        metadataVersion,
        fieldCount: Object.keys(cachedDependencyMap).length,
      });

      return cachedDependencyMap;
    }

    this.logger.log('Building new virtual field dependency map', {
      workspaceId,
      metadataVersion,
    });

    return this.buildAndCacheDependencyMap(
      workspaceId,
      objectMetadataMaps,
      metadataVersion,
    );
  }

  async rebuildDependencyMapForWorkspace(
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
  ): Promise<VirtualFieldDependencyMap> {
    this.logger.log('Rebuilding dependency map for workspace', {
      workspaceId,
    });

    const metadataVersion =
      (await this.workspaceCacheStorageService.getMetadataVersion(
        workspaceId,
      )) || 1;

    return this.buildAndCacheDependencyMap(
      workspaceId,
      objectMetadataMaps,
      metadataVersion,
    );
  }

  getVirtualFieldsAffectedByObjectChange(
    objectNameSingular: string,
    dependencyMap: VirtualFieldDependencyMap,
  ): string[] {
    return this.virtualFieldsDependencyService.getVirtualFieldsAffectedByObject(
      objectNameSingular,
      dependencyMap,
    );
  }

  private async buildAndCacheDependencyMap(
    workspaceId: string,
    objectMetadataMaps: ObjectMetadataMaps,
    metadataVersion: number,
  ): Promise<VirtualFieldDependencyMap> {
    this.logger.log('Starting to build and cache dependency map', {
      workspaceId,
      metadataVersion,
    });

    try {
      const dependencyMap =
        this.virtualFieldsDependencyService.buildCompleteDependencyMap(
          objectMetadataMaps,
        );

      this.logger.log('Built complete dependency map', {
        workspaceId,
        metadataVersion,
        fieldCount: Object.keys(dependencyMap).length,
      });

      await this.workspaceCacheStorageService.setVirtualFieldDependencyMap(
        workspaceId,
        metadataVersion,
        dependencyMap,
      );

      this.logger.log('Successfully cached virtual field dependency map', {
        workspaceId,
        metadataVersion,
        fieldCount: Object.keys(dependencyMap).length,
      });

      return dependencyMap;
    } catch (error) {
      this.logger.error('Failed to build and cache dependency map', {
        workspaceId,
        metadataVersion,
        error,
      });

      return this.virtualFieldsDependencyService.buildCompleteDependencyMap(
        objectMetadataMaps,
      );
    }
  }
}
