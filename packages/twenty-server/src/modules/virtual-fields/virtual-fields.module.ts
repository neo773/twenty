import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

import { ProcessVirtualFieldsJob } from './jobs/process-virtual-fields.job';
import { VirtualFieldsBatchUpdateService } from './services/virtual-fields-batch-update.service';
import { VirtualFieldsComputationService } from './services/virtual-fields-computation.service';
import { VirtualFieldsDependencyManager } from './services/virtual-fields-dependency-manager.service';
import { VirtualFieldsDependencyMapService } from './services/virtual-fields-dependency-map.service';
import { VirtualFieldsEntityResolutionService } from './services/virtual-fields-entity-resolution.service';
import { VirtualFieldsEventFilterService } from './services/virtual-fields-event-filter.service';
import { VirtualFieldsFieldDiscoveryService } from './services/virtual-fields-field-discovery.service';
import { VirtualFieldsPathEvaluatorService } from './services/virtual-fields-path-evaluator.service';
import { VirtualFieldsService } from './services/virtual-fields.service';

@Module({
  imports: [TwentyORMModule, WorkspaceCacheStorageModule],
  providers: [
    VirtualFieldsService,
    VirtualFieldsFieldDiscoveryService,
    VirtualFieldsDependencyMapService,
    VirtualFieldsDependencyManager,
    VirtualFieldsBatchUpdateService,
    VirtualFieldsPathEvaluatorService,
    VirtualFieldsEventFilterService,
    VirtualFieldsEntityResolutionService,
    VirtualFieldsComputationService,
    ProcessVirtualFieldsJob,
  ],
  exports: [
    VirtualFieldsService,
    VirtualFieldsFieldDiscoveryService,
    VirtualFieldsDependencyMapService,
    VirtualFieldsDependencyManager,
    VirtualFieldsBatchUpdateService,
    VirtualFieldsPathEvaluatorService,
    VirtualFieldsEventFilterService,
    VirtualFieldsEntityResolutionService,
    VirtualFieldsComputationService,
  ],
})
export class VirtualFieldsModule {}
