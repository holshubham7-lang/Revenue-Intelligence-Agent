import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type AnyBulkWriteOperation } from 'mongoose';
import { ConnectorAdapterService } from '../connector-runtime/connector-adapter.service.js';
import {
  RevenueEntity,
  RevenueEntityDocument,
} from './revenue-entity.schema.js';

export interface NormalizeEntityInput {
  workspaceId: string;
  connectionId: string;
  connectorSlug: string;
  /** Capability the records were fetched under. */
  capability: string;
  records: Array<Record<string, unknown>>;
  /** Optional per-connector field overrides. */
  fieldMap?: {
    idField?: string;
    nameField?: string;
    amountField?: string;
    statusField?: string;
    stageField?: string;
    dateField?: string;
    entityType?: string;
  };
}

export interface NormalizeEntityResult {
  entityType: string;
  upserted: number;
  written: number;
}

@Injectable()
export class RevenueNormalizerService {
  constructor(
    @InjectModel(RevenueEntity.name)
    private readonly entityModel: Model<RevenueEntityDocument>,
    private readonly adapter: ConnectorAdapterService,
  ) {}

  async normalize(input: NormalizeEntityInput): Promise<NormalizeEntityResult> {
    const entityType = input.fieldMap?.entityType ?? input.capability;
    const sourceKeys = new Set<string>();
    const operations: AnyBulkWriteOperation<RevenueEntityDocument>[] = [];

    for (const record of input.records) {
      const sourceKey = this.adapter.stableKey(input.capability, record);
      if (sourceKeys.has(sourceKey)) continue;
      sourceKeys.add(sourceKey);

      const name = this.pickString(record, [
        input.fieldMap?.nameField,
        'name',
        'Name',
        'subject',
        'title',
        'dealname',
        'firstname',
        'lastname',
        'deal name',
      ]);
      const amount = this.pickNumber(record, [
        input.fieldMap?.amountField,
        'amount',
        'Amount',
        'value',
        'Value',
        'deal_value',
        'annual_recurring_revenue',
        'ARR',
        'total',
      ]);
      const status = this.pickString(record, [
        input.fieldMap?.statusField,
        'status',
        'Status',
        'state',
        'isactive',
      ]);
      const stage = this.pickString(record, [
        input.fieldMap?.stageField,
        'stage',
        'StageName',
        'dealstage',
        'pipeline_stage',
      ]);
      const dateValue = this.pickString(record, [
        input.fieldMap?.dateField,
        'createdAt',
        'created_at',
        'createddate',
        'CreatedDate',
        'created',
      ]);

      const raw = record as Record<string, unknown>;
      operations.push({
        updateOne: {
          filter: {
            workspaceId: input.workspaceId,
            connectionId: input.connectionId,
            entityType,
            sourceKey,
          },
          update: {
            $set: {
              connectorSlug: input.connectorSlug,
              name,
              amount: amount ?? 0,
              currency: 'USD',
              status,
              stage,
              rawDate: this.parseDate(dateValue),
              raw,
              rawHash: this.contentHash(JSON.stringify(record)),
              syncedAt: new Date(),
            },
            $setOnInsert: {
              workspaceId: input.workspaceId,
              connectionId: input.connectionId,
              entityType,
              sourceKey,
            },
          },
          upsert: true,
        },
      });
    }

    let upserted = 0;
    let modified = 0;
    for (let i = 0; i < operations.length; i += 500) {
      const chunk = operations.slice(i, i + 500);
      const res = await this.entityModel.bulkWrite(chunk);
      upserted += res.upsertedCount ?? 0;
      modified += res.modifiedCount ?? 0;
    }

    // Remove entities from a previous sync that the connector no longer
    // returns, so counts and change detection stay accurate.
    await this.entityModel
      .deleteMany({
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        entityType,
        sourceKey: { $nin: [...sourceKeys] },
      })
      .exec();

    return {
      entityType,
      upserted,
      written: upserted + modified,
    };
  }

  private pickString(
    record: Record<string, unknown>,
    fields: Array<string | undefined>,
  ): string | undefined {
    return this.adapter.getString(record, fields.filter(Boolean) as string[]);
  }

  private pickNumber(
    record: Record<string, unknown>,
    fields: Array<string | undefined>,
  ): number | undefined {
    return this.adapter.getNumber(record, fields.filter(Boolean) as string[]);
  }

  private parseDate(value: string | undefined): Date | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private contentHash(input: string): string {
    let h1 = 0xdeadbeef;
    for (let i = 0; i < input.length; i++) {
      h1 = Math.imul(h1 ^ input.charCodeAt(i), 2654435761);
    }
    return (h1 >>> 0).toString(36);
  }
}