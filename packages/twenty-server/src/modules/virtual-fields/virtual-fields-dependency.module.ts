import { Module } from '@nestjs/common';

import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

import { VirtualFieldsDependencyManager } from './services/virtual-fields-dependency-manager.service';
import { VirtualFieldsDependencyMapService } from './services/virtual-fields-dependency-map.service';

@Module({
  imports: [WorkspaceCacheStorageModule],
  providers: [
    VirtualFieldsDependencyMapService,
    VirtualFieldsDependencyManager,
  ],
  exports: [
    VirtualFieldsDependencyMapService,
    VirtualFieldsDependencyManager,
  ],
})
export class VirtualFieldsDependencyModule {} 