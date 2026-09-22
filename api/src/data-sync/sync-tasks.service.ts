import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PluginsService } from '../plugins/plugins.service.js';
import { PluginConnectionsService } from '../plugin-connections/plugin-connections.service.js';
import { PluginConsentsService } from '../plugin-consents/plugin-consents.service.js';
import { ConnectorRuntimeService } from '../connector-runtime/connector-runtime.service.js';
import { RevenueDataService } from '../revenue-data/revenue-data.service.js';
import { SnapshotsService } from '../snapshots/snapshots.service.js';
import { ChangeDetectionService } from '../change-detection/change-detection.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  DataSyncRun,
  DataSyncTrigger,
} from './data-sync.schema.js';

export interface SyncRunResult {
  runId: string;
  status: 'success' | 'error' | 'already-running';
  message?: string;
  capabilitiesProcessed?: number;
  recordsTotal?: number;
  snapshotId?: string;
  snapshotSeq?: number;
  changeSummary?: { added: number; removed: number; modified: number };
}

@Injectable()
export class SyncTasksService {
  private readonly logger = new Logger(SyncTasksService.name);

  constructor(
    @InjectModel(DataSyncRun.name)
    private readonly syncModel: Model<DataSyncRun>,
    private readonly pluginsService: PluginsService,
    private readonly connectionsService: PluginConnectionsService,
    private readonly consentsService: PluginConsentsService,
    private readonly runtimeService: ConnectorRuntimeService,
    private readonly revenueDataService: RevenueDataService,
    private readonly snapshotsService: SnapshotsService,
    private readonly changeDetectionService: ChangeDetectionService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Full pipeline for the first successful connection: consent check →
   * hydration → normalize → summary → baseline snapshot.
   */
  async runInitialSync(input: {
    workspaceId: string;
    connectionId: string;
    trigger: DataSyncTrigger;
    actorId?: string;
  }): Promise<SyncRunResult> {
    const connection = await this.connectionsService.findById(
      input.workspaceId,
      input.connectionId,
    );
    if (connection.status === 'revoked' || connection.status === 'revoking') {
      return { runId: '', status: 'error', message: 'Connection is revoked.' };
    }

    const existing = await this.syncModel
      .findOne({ connectionId: input.connectionId, status: 'running' })
      .lean()
      .exec();
    if (existing) {
      return {
        runId: existing._id.toString(),
        status: 'already-running',
      };
    }

    const activeConsent = await this.consentsService.verifyActive(
      input.connectionId,
    );
    if (!activeConsent) {
      await this.connectionsService.setStatus(input.connectionId, 'expired');
      return {
        runId: '',
        status: 'error',
        message: 'Consent is no longer active.',
      };
    }

    const connector = await this.pluginsService.findConnector(connection.connectorSlug);
    await this.connectionsService.setStatus(input.connectionId, 'syncing');

    const run = await this.syncModel.create({
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      connectorSlug: connection.connectorSlug,
      kind: 'initial',
      trigger: input.trigger,
      status: 'running',
      startedAt: new Date(),
      createdBy: input.actorId,
    });

    try {
      const hydration = await this.runtimeService.hydrateFromConnector({
        connection,
        connector,
      });

      if (hydration.error) {
        throw new Error(hydration.error);
      }

      const writeReport = await this.revenueDataService.applyHydration({
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        connectorSlug: connection.connectorSlug,
        connector,
        hydration,
      });
      const recordsTotal = writeReport.reduce((sum, r) => sum + r.written, 0);

      const summary = await this.revenueDataService.buildSummary(
        input.workspaceId,
        input.connectionId,
      );
      const snapshot = await this.snapshotsService.create({
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        summary,
        runId: run._id.toString(),
        createdBy: input.actorId,
      });

      await this.connectionsService.touchSync(input.connectionId, {
        hydratedDataStatus: 'hydrated',
      });
      await this.auditService.record({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: 'completed',
        category: 'sync',
        targetType: 'connection',
        targetId: input.connectionId,
        message: 'Initial data sync completed',
        metadata: { recordsTotal, snapshotSeq: snapshot.seq },
      });

      run.status = 'success';
      run.finishedAt = new Date();
      run.capabilitiesProcessed = hydration.capabilities.length;
      run.recordsTotal = recordsTotal;
      run.perCapability = writeReport.map((r) => ({
        capability: r.entityType,
        written: r.written,
        upserted: r.upserted,
      }));
      run.snapshotId = snapshot._id.toString();
      run.snapshotSeq = snapshot.seq;
      await run.save();

      return {
        runId: run._id.toString(),
        status: 'success',
        capabilitiesProcessed: run.capabilitiesProcessed,
        recordsTotal,
        snapshotId: run.snapshotId,
        snapshotSeq: run.snapshotSeq,
      };
    } catch (error) {
      this.logger.error(
        `Initial sync failed for ${input.connectionId}`,
        error instanceof Error ? error.stack : undefined,
      );
      run.status = 'error';
      run.error = error instanceof Error ? error.message : String(error);
      run.finishedAt = new Date();
      await run.save();
      await this.connectionsService.touchSync(input.connectionId, {
        hydratedDataStatus: 'failed',
      });
      await this.auditService.record({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: 'failed',
        category: 'sync',
        targetType: 'connection',
        targetId: input.connectionId,
        message: 'Initial data sync failed',
        metadata: { error: run.error },
      });
      return {
        runId: run._id.toString(),
        status: 'error',
        message: run.error,
      };
    }
  }

  /**
   * Manual/scheduled refresh. Captures a new snapshot, diffs it against the
   * previous one and leaves AI findings to the revenue-intelligence layer.
   */
  async runRefresh(input: {
    workspaceId: string;
    connectionId: string;
    trigger: DataSyncTrigger;
    actorId?: string;
  }): Promise<SyncRunResult> {
    const connection = await this.connectionsService.findById(
      input.workspaceId,
      input.connectionId,
    );
    if (connection.status === 'revoked' || connection.status === 'revoking') {
      return { runId: '', status: 'error', message: 'Connection is revoked.' };
    }

    const existing = await this.syncModel
      .findOne({ connectionId: input.connectionId, status: 'running' })
      .lean()
      .exec();
    if (existing) {
      return { runId: existing._id.toString(), status: 'already-running' };
    }

    const activeConsent = await this.consentsService.verifyActive(
      input.connectionId,
    );
    if (!activeConsent) {
      await this.connectionsService.setStatus(input.connectionId, 'expired');
      return {
        runId: '',
        status: 'error',
        message: 'Consent is no longer active.',
      };
    }

    const connector = await this.pluginsService.findConnector(connection.connectorSlug);
    await this.connectionsService.setStatus(input.connectionId, 'syncing');

    const run = await this.syncModel.create({
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      connectorSlug: connection.connectorSlug,
      kind: 'refresh',
      trigger: input.trigger,
      status: 'running',
      startedAt: new Date(),
      createdBy: input.actorId,
    });

    try {
      const hydration = await this.runtimeService.hydrateFromConnector({
        connection,
        connector,
      });
      if (hydration.error) {
        throw new Error(hydration.error);
      }

      const writeReport = await this.revenueDataService.applyHydration({
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        connectorSlug: connection.connectorSlug,
        connector,
        hydration,
      });
      const recordsTotal = writeReport.reduce((sum, r) => sum + r.written, 0);

      const summary = await this.revenueDataService.buildSummary(
        input.workspaceId,
        input.connectionId,
      );
      const snapshot = await this.snapshotsService.create({
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        summary,
        runId: run._id.toString(),
        createdBy: input.actorId,
      });

      const changeSummary = await this.changeDetectionService.runForLatestSnapshot({
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        snapshotId: snapshot._id.toString(),
        snapshotSeq: snapshot.seq,
      });

      await this.connectionsService.touchSync(input.connectionId, {
        hydratedDataStatus: 'hydrated',
      });
      await this.auditService.record({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: 'completed',
        category: 'sync',
        targetType: 'connection',
        targetId: input.connectionId,
        message:
          changeSummary.totalSaved > 0
            ? 'Refresh completed with changes detected'
            : 'Refresh completed',
        metadata: {
          recordsTotal,
          changeSummary,
          snapshotSeq: snapshot.seq,
        },
      });

      run.status = 'success';
      run.finishedAt = new Date();
      run.capabilitiesProcessed = hydration.capabilities.length;
      run.recordsTotal = recordsTotal;
      run.perCapability = writeReport.map((r) => ({
        capability: r.entityType,
        written: r.written,
        upserted: r.upserted,
      }));
      run.changeSummary = {
        added: changeSummary.added,
        removed: changeSummary.removed,
        modified: changeSummary.modified,
      };
      run.snapshotId = snapshot._id.toString();
      run.snapshotSeq = snapshot.seq;
      await run.save();

      return {
        runId: run._id.toString(),
        status: 'success',
        capabilitiesProcessed: run.capabilitiesProcessed,
        recordsTotal,
        snapshotId: run.snapshotId,
        snapshotSeq: run.snapshotSeq,
        changeSummary: run.changeSummary,
      };
    } catch (error) {
      this.logger.error(
        `Refresh failed for ${input.connectionId}`,
        error instanceof Error ? error.stack : undefined,
      );
      run.status = 'error';
      run.error = error instanceof Error ? error.message : String(error);
      run.finishedAt = new Date();
      await run.save();
      await this.connectionsService.touchSync(input.connectionId, {
        hydratedDataStatus: 'failed',
      });
      await this.auditService.record({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: 'failed',
        category: 'sync',
        targetType: 'connection',
        targetId: input.connectionId,
        message: 'Refresh failed',
        metadata: { error: run.error },
      });
      return { runId: run._id.toString(), status: 'error', message: run.error };
    }
  }

  async getStatus(
    workspaceId: string,
    connectionId: string,
  ): Promise<DataSyncRun[]> {
    return this.syncModel
      .find({ workspaceId, connectionId })
      .sort({ startedAt: -1 })
      .limit(20)
      .lean()
      .exec();
  }

  async findRun(workspaceId: string, runId: string): Promise<DataSyncRun> {
    const run = await this.syncModel
      .findOne({ _id: runId, workspaceId })
      .lean()
      .exec();
    if (!run) {
      throw new NotFoundException('Sync run not found');
    }
    return run;
  }
}