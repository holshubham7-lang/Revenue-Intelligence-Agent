import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConnectorMetadata } from '../plugins/plugins.service.js';
import { HydrationResult } from '../connector-runtime/connector-runtime.service.js';
import {
  RevenueEntity,
  RevenueEntityDocument,
} from './revenue-entity.schema.js';
import { RevenueNormalizerService } from './revenue-normalizer.service.js';

export interface RevenueSummary {
  workspaceId: string;
  connectionId: string;
  totalRecords: number;
  totalAmount: number;
  entityTypes: Array<{
    entityType: string;
    count: number;
    amount: number;
  }>;
  perStage: Array<{
    entityType: string;
    stage: string;
    count: number;
    amount: number;
  }>;
  asOf: Date;
}

@Injectable()
export class RevenueDataService {
  constructor(
    @InjectModel(RevenueEntity.name)
    private readonly entityModel: Model<RevenueEntityDocument>,
    private readonly normalizer: RevenueNormalizerService,
  ) {}

  /**
   * Persists normalized entities from a hydration run with per-connector
   * field overrides. Returns a per-type write report.
   */
  async applyHydration(input: {
    workspaceId: string;
    connectionId: string;
    connectorSlug: string;
    connector: ConnectorMetadata;
    hydration: HydrationResult;
  }): Promise<
    Array<{ entityType: string; written: number; upserted: number }>
  > {
    if (input.hydration.error) {
      return [];
    }
    const report: Array<{ entityType: string; written: number; upserted: number }> =
      [];
    for (const capability of input.hydration.capabilities) {
      const result = await this.normalizer.normalize({
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        connectorSlug: input.connectorSlug,
        capability: capability.capability,
        records: capability.records,
        fieldMap: input.connector.normalization,
      });
      report.push(result);
    }
    return report;
  }

  /** Aggregates the normalized pipeline into the snapshot summary shape. */
  async buildSummary(
    workspaceId: string,
    connectionId: string,
  ): Promise<RevenueSummary> {
    const [grouped, totals] = await Promise.all([
      this.entityModel
        .aggregate([
          { $match: { workspaceId, connectionId } },
          {
            $group: {
              _id: { entityType: '$entityType', stage: '$stage' },
              count: { $sum: 1 },
              amount: { $sum: { $ifNull: ['$amount', 0] } },
            },
          },
        ])
        .exec(),
      this.entityModel
        .aggregate([
          { $match: { workspaceId, connectionId } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              amount: { $sum: { $ifNull: ['$amount', 0] } },
            },
          },
        ])
        .exec(),
    ]);

    const perStage = grouped.map((g) => ({
      entityType: (g._id as { entityType: string }).entityType,
      stage: (g._id as { stage: string }).stage ?? 'unspecified',
      count: (g.count as number) ?? 0,
      amount: (g.amount as number) ?? 0,
    }));

    const entityTypeMap = new Map<string, { entityType: string; count: number; amount: number }>();
    for (const row of perStage) {
      const existing = entityTypeMap.get(row.entityType) ?? {
        entityType: row.entityType,
        count: 0,
        amount: 0,
      };
      existing.count += row.count;
      existing.amount += row.amount;
      entityTypeMap.set(row.entityType, existing);
    }

    return {
      workspaceId,
      connectionId,
      totalRecords: (totals[0]?.count as number) ?? 0,
      totalAmount: (totals[0]?.amount as number) ?? 0,
      entityTypes: [...entityTypeMap.values()].sort((a, b) => b.count - a.count),
      perStage,
      asOf: new Date(),
    };
  }
}