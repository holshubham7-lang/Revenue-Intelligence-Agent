import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  RevenueEntity,
  RevenueEntityDocument,
} from '../revenue-data/revenue-entity.schema.js';
import {
  RevenueSnapshot,
  RevenueSnapshotDocument,
  EntityFingerprint,
} from './revenue-snapshot.schema.js';
import { RevenueSummary } from '../revenue-data/revenue-data.service.js';

@Injectable()
export class SnapshotsService {
  constructor(
    @InjectModel(RevenueSnapshot.name)
    private readonly snapshotModel: Model<RevenueSnapshotDocument>,
    @InjectModel(RevenueEntity.name)
    private readonly entityModel: Model<RevenueEntityDocument>,
  ) {}

  async create(input: {
    workspaceId: string;
    connectionId: string;
    summary: RevenueSummary;
    runId?: string;
    createdBy?: string;
  }): Promise<RevenueSnapshotDocument> {
    const countDoc = await this.snapshotModel
      .findOne({ connectionId: input.connectionId })
      .sort({ seq: -1 })
      .select('seq')
      .lean()
      .exec();
    const seq = (countDoc?.seq ?? 0) + 1;

    const entities = await this.entityModel
      .find({
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
      })
      .select('entityType sourceKey rawHash amount stage')
      .lean()
      .exec();

    const countByType = new Map<string, number>();
    for (const entity of entities) {
      countByType.set(
        entity.entityType,
        (countByType.get(entity.entityType) ?? 0) + 1,
      );
    }

    const fingerprints: EntityFingerprint[] = entities.map((e) => ({
      entityType: e.entityType,
      sourceKey: e.sourceKey,
      rawHash: e.rawHash ?? '',
      amount: e.amount,
      stage: e.stage,
    }));

    return this.snapshotModel.create({
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      snapshotTimestamp: new Date(),
      seq,
      summary: input.summary,
      recordCounts: Object.fromEntries(countByType),
      entityFingerprints: fingerprints,
      runId: input.runId,
      createdBy: input.createdBy,
    });
  }

  async getLatest(
    connectionId: string,
  ): Promise<RevenueSnapshotDocument | null> {
    return this.snapshotModel
      .findOne({ connectionId })
      .sort({ seq: -1 })
      .lean()
      .exec();
  }

  async getPrevious(
    connectionId: string,
    beforeSeq: number,
  ): Promise<RevenueSnapshotDocument | null> {
    return this.snapshotModel
      .findOne({ connectionId, seq: { $lt: beforeSeq } })
      .sort({ seq: -1 })
      .lean()
      .exec();
  }

  async getSnapshot(
    workspaceId: string,
    snapshotId: string,
  ): Promise<RevenueSnapshotDocument> {
    const snapshot = await this.snapshotModel
      .findOne({ _id: snapshotId, workspaceId })
      .lean()
      .exec();
    if (!snapshot) {
      throw new NotFoundException('Snapshot not found');
    }
    return snapshot;
  }

  async listForConnection(
    connectionId: string,
    limit = 30,
  ): Promise<RevenueSnapshotDocument[]> {
    return this.snapshotModel
      .find({ connectionId })
      .sort({ seq: -1 })
      .limit(limit)
      .lean()
      .exec();
  }
}