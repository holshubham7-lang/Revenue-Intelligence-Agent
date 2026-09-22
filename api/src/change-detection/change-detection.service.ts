import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type AnyBulkWriteOperation } from 'mongoose';
import { EntityFingerprint } from '../snapshots/revenue-snapshot.schema.js';
import { SnapshotsService } from '../snapshots/snapshots.service.js';
import {
  RevenueChange,
  RevenueChangeDocument,
  SeverityLevel,
} from './revenue-change.schema.js';

export interface DifferenceResult {
  snapshotId: string;
  snapshotSeq: number;
  added: number;
  removed: number;
  modified: number;
  totalSaved: number;
}

const AMOUNT_SEVERITY_HIGH_RATIO = 0.2;
const AMOUNT_SEVERITY_MEDIUM_RATIO = 0.05;

@Injectable()
export class ChangeDetectionService {
  constructor(
    @InjectModel(RevenueChange.name)
    private readonly changeModel: Model<RevenueChangeDocument>,
    private readonly snapshotsService: SnapshotsService,
  ) {}

  /**
   * Diffs the latest snapshot (already recorded) against the previous one and
   * persists revenue_changes rows. Returns a summary of the detected set.
   *
   * The first snapshot for a connection is treated as a baseline and produces
   * no changes.
   */
  async runForLatestSnapshot(input: {
    workspaceId: string;
    connectionId: string;
    snapshotId: string;
    snapshotSeq: number;
  }): Promise<DifferenceResult> {
    const current = await this.snapshotsService.getSnapshot(
      input.workspaceId,
      input.snapshotId,
    );
    const previous = await this.snapshotsService.getPrevious(
      input.connectionId,
      input.snapshotSeq,
    );

    if (!previous) {
      return {
        snapshotId: input.snapshotId,
        snapshotSeq: input.snapshotSeq,
        added: 0,
        removed: 0,
        modified: 0,
        totalSaved: 0,
      };
    }

    const currentFps = current.entityFingerprints ?? [];
    const previousFps = previous.entityFingerprints ?? [];
    const previousByKey = new Map<string, EntityFingerprint>();
    for (const fp of previousFps) {
      previousByKey.set(this.keyOf(fp), fp);
    }
    const currentByKey = new Map<string, EntityFingerprint>();
    for (const fp of currentFps) {
      currentByKey.set(this.keyOf(fp), fp);
    }

    const added: EntityFingerprint[] = [];
    const removed: EntityFingerprint[] = [];
    const modified: Array<{ prev: EntityFingerprint; next: EntityFingerprint }> =
      [];

    for (const fp of currentFps) {
      const prev = previousByKey.get(this.keyOf(fp));
      if (!prev) {
        added.push(fp);
      } else if (prev.rawHash !== fp.rawHash) {
        modified.push({ prev, next: fp });
      }
    }
    for (const fp of previousFps) {
      if (!currentByKey.has(this.keyOf(fp))) {
        removed.push(fp);
      }
    }

    const saved = await this.persistChanges({
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      snapshotId: input.snapshotId,
      snapshotSeq: input.snapshotSeq,
      added,
      removed,
      modified,
    });

    return {
      snapshotId: input.snapshotId,
      snapshotSeq: input.snapshotSeq,
      added: added.length,
      removed: removed.length,
      modified: modified.length,
      totalSaved: saved,
    };
  }

  async recentChanges(input: {
    workspaceId: string;
    connectionId: string;
    snapshotId?: string;
    limit?: number;
    minSeverity?: 'low' | 'medium' | 'high';
  }): Promise<RevenueChangeDocument[]> {
    const filter: Record<string, unknown> = {
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
    };
    if (input.snapshotId) filter.snapshotId = input.snapshotId;
    if (input.minSeverity === 'medium') {
      filter.severity = { $in: ['medium', 'high'] };
    } else if (input.minSeverity === 'high') {
      filter.severity = 'high';
    }
    return this.changeModel
      .find(filter, { sourceKey: 0, _id: 0 })
      .sort({ detectedAt: -1 })
      .limit(Math.min(input.limit ?? 200, 1000))
      .lean()
      .exec();
  }

  private async persistChanges(input: {
    workspaceId: string;
    connectionId: string;
    snapshotId: string;
    snapshotSeq: number;
    added: EntityFingerprint[];
    removed: EntityFingerprint[];
    modified: Array<{ prev: EntityFingerprint; next: EntityFingerprint }>;
  }): Promise<number> {
    const rows: AnyBulkWriteOperation<RevenueChangeDocument>[] = [];

    for (const fp of input.added) {
      rows.push(
        this.row(input.workspaceId, input.connectionId, input.snapshotId, input.snapshotSeq, {
          diffType: 'added',
          entityType: fp.entityType,
          sourceKey: fp.sourceKey,
          name: this.labelFor(fp),
          newAmount: fp.amount ?? 0,
          newStage: fp.stage,
          severity: 'medium',
          significance: 'New record appeared in your pipeline.',
          notes: 'Detected against a previously captured snapshot.',
        }),
      );
    }

    for (const fp of input.removed) {
      rows.push(
        this.row(input.workspaceId, input.connectionId, input.snapshotId, input.snapshotSeq, {
          diffType: 'removed',
          entityType: fp.entityType,
          sourceKey: fp.sourceKey,
          name: this.labelFor(fp),
          previousAmount: fp.amount ?? 0,
          previousStage: fp.stage,
          severity: 'medium',
          significance: 'Record no longer present in your pipeline.',
          notes: 'Either deleted or moved outside the current sync scope.',
        }),
      );
    }

    for (const { prev, next } of input.modified) {
      const amountDelta = (next.amount ?? 0) - (prev.amount ?? 0);
      const stageChanged =
        (prev.stage ?? undefined) !== (next.stage ?? undefined);
      const severity = this.severityFor(prev.amount ?? 0, next.amount ?? 0);
      rows.push(
        this.row(input.workspaceId, input.connectionId, input.snapshotId, input.snapshotSeq, {
          diffType: 'modified',
          entityType: next.entityType,
          sourceKey: next.sourceKey,
          name: this.labelFor(next),
          previousAmount: prev.amount ?? 0,
          newAmount: next.amount ?? 0,
          previousStage: prev.stage,
          newStage: next.stage,
          severity,
          significance: this.significanceFor(
            prev.amount ?? 0,
            next.amount ?? 0,
            stageChanged,
          ),
          notes: this.notesFor(amountDelta, stageChanged),
        }),
      );
    }

    let total = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const res = await this.changeModel.bulkWrite(chunk);
      total += (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0);
    }
    return total;
  }

  private row(
    workspaceId: string,
    connectionId: string,
    snapshotId: string,
    snapshotSeq: number,
    data: Record<string, unknown>,
  ): AnyBulkWriteOperation<RevenueChangeDocument> {
    return {
      updateOne: {
        filter: {
          connectionId,
          snapshotId,
          sourceKey:
            (data.sourceKey as string) ??
            `${data.entityType as string}:${data.diffType as string}`,
        },
        update: {
          $set: {
            workspaceId,
            connectionId,
            snapshotId,
            snapshotSeq,
            detectedAt: new Date(),
            ...data,
          },
        },
        upsert: true,
      },
    };
  }

  private keyOf(fp: EntityFingerprint): string {
    return `${fp.entityType}:${fp.sourceKey}`;
  }

  private labelFor(fp: EntityFingerprint): string {
    if (fp.sourceKey.includes(':')) {
      return fp.sourceKey.split(':')[1] ?? fp.sourceKey;
    }
    return fp.sourceKey;
  }

  private severityFor(previous: number, next: number): SeverityLevel {
    if (previous <= 0) {
      return next > 0 ? 'medium' : 'low';
    }
    const ratio = Math.abs(next - previous) / previous;
    if (ratio >= AMOUNT_SEVERITY_HIGH_RATIO) return 'high';
    if (ratio >= AMOUNT_SEVERITY_MEDIUM_RATIO) return 'medium';
    return 'low';
  }

  private significanceFor(
    previous: number,
    next: number,
    stageChanged: boolean,
  ): string {
    const parts: string[] = [];
    if (next !== previous) {
      const delta = next - previous;
      parts.push(
        `${delta >= 0 ? '+' : '-'}$${Math.abs(delta).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      );
      if (previous > 0) {
        const pct = (Math.abs(delta) / previous) * 100;
        parts.push(`${pct.toFixed(1)}%`);
      }
    }
    if (stageChanged) {
      parts.push('stage movement');
    }
    return parts.length > 0
      ? `Changed: ${parts.join(', ')}.`
      : 'Record was updated.';
  }

  private notesFor(amountDelta: number, stageChanged: boolean): string {
    if (amountDelta !== 0 && stageChanged) {
      return 'Both value and pipeline stage changed.';
    }
    if (amountDelta !== 0) {
      return 'Monetary value changed.';
    }
    return 'Pipeline stage changed.';
  }
}