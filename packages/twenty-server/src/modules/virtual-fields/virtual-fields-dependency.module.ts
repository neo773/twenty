import { Module } from '@nestjs/common';

import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

import { VirtualFieldsCacheService } from './services/virtual-fields-cache.service';
import { VirtualFieldsDependencyService } from './services/virtual-fields-dependency.service';

@Module({
  imports: [WorkspaceCacheStorageModule],
  providers: [
    VirtualFieldsDependencyService,
    VirtualFieldsCacheService,
  ],
  exports: [
    VirtualFieldsDependencyService,
    VirtualFieldsCacheService,
  ],
})
export class VirtualFieldsDependencyModule {} 