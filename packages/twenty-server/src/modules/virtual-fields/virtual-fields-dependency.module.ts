import { Module } from '@nestjs/common';

import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

import { VirtualFieldsDependencyManagerService } from './services/virtual-fields-dependency-manager.service';
import { VirtualFieldsDependencyMapService } from './services/virtual-fields-dependency-map.service';

@Module({
  imports: [WorkspaceCacheStorageModule],
  providers: [
    VirtualFieldsDependencyMapService,
    VirtualFieldsDependencyManagerService,
  ],
  exports: [
    VirtualFieldsDependencyMapService,
    VirtualFieldsDependencyManagerService,
  ],
})
export class VirtualFieldsDependencyModule {} 