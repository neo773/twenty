import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';

import { ProcessPreComputedFieldsJob } from './jobs/process-virtual-fields.job';
import { VirtualFieldsBatchUpdateService } from './services/virtual-fields-batch-update.service';
import { VirtualFieldsExpressionEvaluatorService } from './services/virtual-fields-expression-evaluator.service';
import { VirtualFieldsFieldDiscoveryService } from './services/virtual-fields-field-discovery.service';
import { VirtualFieldsPathEvaluatorService } from './services/virtual-fields-path-evaluator.service';
import { VirtualFieldsService } from './services/virtual-fields.service';

@Module({
  imports: [TwentyORMModule, WorkspaceCacheStorageModule],
  providers: [
    VirtualFieldsService,
    VirtualFieldsFieldDiscoveryService,
    VirtualFieldsBatchUpdateService,
    VirtualFieldsExpressionEvaluatorService,
    VirtualFieldsPathEvaluatorService,

    ProcessPreComputedFieldsJob,
  ],
  exports: [
    VirtualFieldsService,
    VirtualFieldsFieldDiscoveryService,
    VirtualFieldsBatchUpdateService,
    VirtualFieldsExpressionEvaluatorService,
    VirtualFieldsPathEvaluatorService,
  ],
})
export class PreComputedFieldsModule {}
