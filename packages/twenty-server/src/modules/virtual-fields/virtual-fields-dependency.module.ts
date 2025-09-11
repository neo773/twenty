import { Module } from '@nestjs/common';

import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

import { VirtualFieldDependencyManager } from './services/virtual-field-dependency-manager.service';
import { VirtualFieldDependencyMapBuilder } from './services/virtual-field-dependency-map-builder.service';

@Module({
  imports: [WorkspaceCacheStorageModule],
  providers: [
    VirtualFieldDependencyMapBuilder,
    VirtualFieldDependencyManager,
  ],
  exports: [
    VirtualFieldDependencyMapBuilder,
    VirtualFieldDependencyManager,
  ],
})
export class VirtualFieldsDependencyModule {} 