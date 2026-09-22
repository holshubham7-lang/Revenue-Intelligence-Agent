import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AgentService } from '../agent/agent.service.js';
import { SnapshotsService } from '../snapshots/snapshots.service.js';
import { ChangeDetectionService } from '../change-detection/change-detection.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  RevenueFinding,
  RevenueFindingDocument,
  FindingSeverity,
  FindingTrend,
  FindingEntityReference,
} from './revenue-finding.schema.js';
import { RevenueSummary } from '../revenue-data/revenue-data.service.js';

export interface AnalyzeResult {
  snapshotId: string;
  snapshotSeq: number;
  findings: RevenueFindingDocument[];
  enginesUsed: Array<'ai' | 'rule'>;
}

export interface RichSummary {
  previous?: Pick<
    RevenueSummary,
    'totalRecords' | 'totalAmount' | 'entityTypes'
  >;
  current: Pick<RevenueSummary, 'totalRecords' | 'totalAmount' | 'entityTypes'>;
  changes: {
    added: number;
    removed: number;
    modified: number;
    bySeverity: { high: number; medium: number; low: number };
  };
  topChanged: Array<{
    entityType: string;
    name: string;
    previousAmount?: number;
    newAmount?: number;
    severity: string;
  }>;
}

const SEVERITY_HIGH_RATIO = 0.2;
const SEVERITY_MEDIUM_RATIO = 0.05;
const MAX_KEY_ENTITIES = 5;

@Injectable()
export class RevenueIntelligenceService {
  private readonly logger = new Logger(RevenueIntelligenceService.name);

  constructor(
    @InjectModel(RevenueFinding.name)
    private readonly findingModel: Model<RevenueFindingDocument>,
    private readonly agentService: AgentService,
    private readonly snapshotsService: SnapshotsService,
    private readonly changeDetectionService: ChangeDetectionService,
    private readonly auditService: AuditService,
  ) {}

  async analyze(input: {
    workspaceId: string;
    connectionId: string;
    actorId?: string;
  }): Promise<AnalyzeResult> {
    const latest = await this.snapshotsService.getLatest(input.connectionId);
    if (!latest) {
      return {
        snapshotId: '',
        snapshotSeq: 0,
        findings: [],
        enginesUsed: [],
      };
    }

    const previous = latest.seq > 1
      ? await this.snapshotsService.getPrevious(input.connectionId, latest.seq)
      : null;

    const changes = await this.changeDetectionService.recentChanges({
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      snapshotId: latest._id.toString(),
      limit: 500,
    });

    const context = this.buildContext(latest.summary, previous?.summary, changes);

    let findings: Array<{
      title: string;
      summary?: string;
      severity: FindingSeverity;
      trend?: FindingTrend;
      layer?: string;
      recommendations?: string[];
      metrics?: { previous: number; current: number; delta: number; pct: number };
      keyEntities: FindingEntityReference[];
    }>;
    let enginesUsed: Array<'ai' | 'rule'> = ['rule'];

    const aiFindings = await this.tryAiAnalysis(context, input.connectionId);
    if (aiFindings) {
      findings = aiFindings;
      enginesUsed = ['ai'];
    } else {
      findings = this.ruleFindings(context);
    }

    await this.findingModel
      .deleteMany({
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        snapshotId: latest._id.toString(),
      })
      .exec();

    const persisted = await this.findingModel.insertMany(
      findings.map((f) => ({
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        snapshotId: latest._id.toString(),
        layer: f.layer,
        title: f.title,
        summary: f.summary,
        severity: f.severity,
        trend: f.trend,
        metrics: f.metrics,
        keyEntities: f.keyEntities,
        recommendations: f.recommendations,
        enginesUsed,
      })),
    );

    await this.auditService.record({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'analyzed',
      category: 'revenue_intelligence',
      targetType: 'connection',
      targetId: input.connectionId,
      message: `Revenue Intelligence analysis ran (${enginesUsed[0]})`,
      metadata: {
        snapshotSeq: latest.seq,
        enginesUsed,
        findingCount: persisted.length,
      },
    });

    return {
      snapshotId: latest._id.toString(),
      snapshotSeq: latest.seq,
      findings: persisted,
      enginesUsed,
    };
  }

  async listFindings(
    workspaceId: string,
    connectionId: string,
  ): Promise<RevenueFindingDocument[]> {
    const latest = await this.snapshotsService.getLatest(connectionId);
    return this.findingModel
      .find({
        workspaceId,
        connectionId,
        snapshotId: latest ? latest._id.toString() : undefined,
      })
      .sort({ severity: -1 })
      .lean()
      .exec();
  }

  async dismissFinding(
    workspaceId: string,
    connectionId: string,
    findingId: string,
    actorId: string,
  ): Promise<RevenueFindingDocument | null> {
    return this.findingModel
      .findOneAndUpdate(
        { _id: findingId, workspaceId, connectionId },
        {
          $set: {
            dismissal: { dismissed: true, dismissedBy: actorId, dismissedAt: new Date() },
          },
        },
        { new: true },
      )
      .lean()
      .exec();
  }

  private buildContext(
    current: RevenueSummary,
    previous: RevenueSummary | undefined,
    changes: Array<{
      diffType: string;
      entityType?: string;
      name?: string;
      previousAmount?: number;
      newAmount?: number;
      severity: string;
    }>,
  ): RichSummary {
    const counts = { added: 0, removed: 0, modified: 0 };
    const bySeverity = { high: 0, medium: 0, low: 0 };
    const topChanged: RichSummary['topChanged'] = [];

    for (const change of changes) {
      if (change.diffType === 'added') counts.added++;
      else if (change.diffType === 'removed') counts.removed++;
      else counts.modified++;
      if (change.severity === 'high') bySeverity.high++;
      else if (change.severity === 'medium') bySeverity.medium++;
      else bySeverity.low++;

      if (topChanged.length < MAX_KEY_ENTITIES) {
        topChanged.push({
          entityType: change.entityType ?? 'record',
          name: change.name ?? change.entityType ?? 'unknown',
          previousAmount: change.previousAmount,
          newAmount: change.newAmount,
          severity: change.severity,
        });
      }
    }

    return {
      previous: previous
        ? {
            totalRecords: previous.totalRecords,
            totalAmount: previous.totalAmount,
            entityTypes: previous.entityTypes,
          }
        : undefined,
      current: {
        totalRecords: current.totalRecords,
        totalAmount: current.totalAmount,
        entityTypes: current.entityTypes,
      },
      changes: { ...counts, bySeverity },
      topChanged,
    };
  }

  /** Asks the agent for structured, layered findings. Returns null on failure. */
  private async tryAiAnalysis(
    context: RichSummary,
    connectionId: string,
  ): Promise<
    Array<{
      title: string;
      summary?: string;
      severity: FindingSeverity;
      trend?: FindingTrend;
      layer?: string;
      recommendations?: string[];
      metrics?: { previous: number; current: number; delta: number; pct: number };
      keyEntities: FindingEntityReference[];
    }> | null
  > {
    const prompt = this.buildAiPrompt(context);
    try {
      const response = await this.agentService.chat({ content: prompt });
      if (!response.content.trim()) return null;
      return this.parseAiFindings(response.content, context);
    } catch (error) {
      this.logger.warn(
        `AI analysis skipped for ${connectionId}`,
        error instanceof Error ? error.message : undefined,
      );
      return null;
    }
  }

  private buildAiPrompt(context: RichSummary): string {
    const lines = [
      'You are a Revenue Intelligence analyst. Analyze the pipeline snapshot diff below and return findings as JSON.',
      '',
      'Pipeline overview (current):',
      `Total records: ${context.current.totalRecords}`,
      `Total amount: $${context.current.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      `By type: ${
        Object.entries(context.current.entityTypes)
          .map(([k, v]) => `${k}=${v.count} ($${Math.round(v.amount)})`)
          .join(', ') || 'none'
      }`,
      '',
    ];
    if (context.previous) {
      lines.push('Pipeline overview (previous):');
      lines.push(
        `Total records: ${context.previous.totalRecords}`,
        `Total amount: $${context.previous.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        'By type: ' +
          (Object.entries(context.previous.entityTypes)
            .map(([k, v]) => `${k}=${v.count} ($${Math.round(v.amount)})`)
            .join(', ') || 'none'),
        '',
      );
    } else {
      lines.push('(This is the first snapshot; no previous baseline exists.)', '');
    }

    lines.push('Detected changes:');
    lines.push(
      `added=${context.changes.added} removed=${context.changes.removed} modified=${context.changes.modified}`,
      `high=${context.changes.bySeverity.high} medium=${context.changes.bySeverity.medium} low=${context.changes.bySeverity.low}`,
      '',
    );
    if (context.topChanged.length > 0) {
      lines.push('Top changed records:');
      for (const c of context.topChanged) {
        lines.push(
          `- ${c.name} (${c.entityType}) ${c.previousAmount??0} -> ${c.newAmount??0} severity=${c.severity}`,
        );
      }
      lines.push('');
    }

    lines.push(
      'Return ONLY a JSON object in this exact shape:',
      '{"findings":[{"layer":"summary|growth|units|contract","title":"...","summary":"...","severity":"low|medium|high","trend":"up|down|flat|mixed","recommendations":["..."]}]}',
      'Layer guidance: summary=overall totals, growth=trend/velocity, units=record count movements, contract=stages/win-loss. Max 6 findings. No markdown fences.',
    );
    return lines.join('\n');
  }

  private parseAiFindings(
    content: string,
    context: RichSummary,
  ): Array<{
    title: string;
    summary?: string;
    severity: FindingSeverity;
    trend?: FindingTrend;
    layer?: string;
    recommendations?: string[];
    metrics?: { previous: number; current: number; delta: number; pct: number };
    keyEntities: FindingEntityReference[];
  }> {
    let jsonText = content.trim();
    const fenced = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) jsonText = fenced[1].trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return this.ruleFindings(context);
    }

    const list = (parsed as { findings?: unknown[] } | undefined)?.findings;
    if (!Array.isArray(list) || list.length === 0) {
      return this.ruleFindings(context);
    }

    const allowedLayers = new Set(['summary', 'growth', 'units', 'contract', 'default']);
    return list
      .map((item) => {
        const raw = (item ?? {}) as Record<string, unknown>;
        const severity = String(raw.severity ?? 'medium');
        const trend = String(raw.trend ?? 'flat');
        const layer = String(raw.layer ?? 'default');
        const unsafeSeverity = severity === 'high' || severity === 'low' ? severity : 'medium';
        const unsafeTrend =
          trend === 'up' || trend === 'down' || trend === 'mixed' ? trend : 'flat';
        return {
          title: String(raw.title ?? 'Revenue finding'),
          summary: typeof raw.summary === 'string' ? raw.summary : undefined,
          severity: unsafeSeverity as FindingSeverity,
          trend: unsafeTrend as FindingTrend,
          layer: allowedLayers.has(layer) ? layer : 'default',
          recommendations: Array.isArray(raw.recommendations)
            ? (raw.recommendations as unknown[])
                .filter((r): r is string => typeof r === 'string')
                .slice(0, 5)
            : [],
          keyEntities: context.topChanged.map((c) => ({
            entityType: c.entityType,
            sourceKey: c.name,
            name: c.name,
            before: c.previousAmount,
            after: c.newAmount,
          })),
        };
      })
      .filter((f) => f.title.length > 0)
      .slice(0, 6);
  }

  private toKeyEntities(
    top: RichSummary['topChanged'],
  ): FindingEntityReference[] {
    return top.slice(0, MAX_KEY_ENTITIES).map((c) => ({
      entityType: c.entityType,
      sourceKey: c.name,
      name: c.name,
      before: c.previousAmount,
      after: c.newAmount,
    }));
  }

  private ruleFindings(
    context: RichSummary,
  ): Array<{
    title: string;
    summary?: string;
    severity: FindingSeverity;
    trend?: FindingTrend;
    layer?: string;
    recommendations?: string[];
    metrics?: { previous: number; current: number; delta: number; pct: number };
    keyEntities: FindingEntityReference[];
  }> {
    const findings: Array<{
      title: string;
      summary?: string;
      severity: FindingSeverity;
      trend?: FindingTrend;
      layer?: string;
      recommendations?: string[];
      metrics?: { previous: number; current: number; delta: number; pct: number };
      keyEntities: FindingEntityReference[];
    }> = [];

    const currentAmount = context.current.totalAmount;
    const previousAmount = context.previous?.totalAmount ?? 0;
    const amountDelta = currentAmount - previousAmount;
    const amountPct =
      previousAmount > 0 ? (Math.abs(amountDelta) / previousAmount) * 100 : 0;
    const severityForDelta: FindingSeverity =
      amountPct >= SEVERITY_HIGH_RATIO * 100
        ? 'high'
        : amountPct >= SEVERITY_MEDIUM_RATIO * 100
          ? 'medium'
          : 'low';

    if (context.previous && Math.abs(amountDelta) > 0.005) {
      findings.push({
        layer: 'summary',
        title:
          amountDelta > 0
            ? `Pipeline value grew by $${amountDelta.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : `Pipeline value shrank by $${Math.abs(amountDelta).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        summary:
          amountDelta > 0
            ? `Total pipeline value moved from $${previousAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} to $${currentAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}.`
            : `Total pipeline value moved from $${previousAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} to $${currentAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}.`,
        severity: severityForDelta,
        trend: amountDelta > 0 ? 'up' : 'down',
        metrics: {
          previous: previousAmount,
          current: currentAmount,
          delta: amountDelta,
          pct: Number(amountPct.toFixed(1)),
        },
        recommendations:
          amountDelta > 0
            ? [
                'Review the newly added value for concentration risk.',
                'Confirm the largest gains are backed by realistic close dates.',
              ]
            : [
                'Investigate the deals that shrank or moved out.',
                'Check the stage definitions that caused the drop.',
              ],
        keyEntities: this.toKeyEntities(context.topChanged),
      });
    }

    if (context.changes.added > 0) {
      findings.push({
        layer: 'units',
        title: `${context.changes.added} new ${context.changes.added === 1 ? 'record' : 'records'} entered your pipeline`,
        summary: `Units grew since the last capture (total now ${context.current.totalRecords}).`,
        severity: context.changes.added >= 5 ? 'medium' : 'low',
        trend: 'up',
        recommendations: [
          'Qualify the inflow so pipeline reportable units stay accurate.',
          'Ensure close dates and owners are set on the new records.',
        ],
        keyEntities: this.toKeyEntities(
          context.topChanged.filter(
            (c) =>
              c.newAmount !== undefined && (c.previousAmount ?? 0) === 0,
          ),
        ),
      });
    }

    if (context.changes.removed > 0) {
      findings.push({
        layer: 'units',
        title: `${context.changes.removed} ${context.changes.removed === 1 ? 'record' : 'records'} dropped out of scope`,
        summary: 'The difference engine stopped tracking units that no longer match the sync scope.',
        severity: context.changes.removed >= 5 ? 'medium' : 'low',
        trend: 'down',
        recommendations: [
          'Confirm the losses are intentional before acting on them.',
          'Review the connector sync scope if the drop looks unexpected.',
        ],
        keyEntities: this.toKeyEntities(context.topChanged),
      });
    }

    if (context.changes.modified > 0) {
      const recordKeyEntities = context.topChanged.filter(
        (c) => c.previousAmount !== undefined && c.newAmount !== undefined,
      );
      findings.push({
        layer: 'contract',
        title: `${context.changes.modified} record${context.changes.modified === 1 ? '' : 's'} changed value or stage`,
        summary:
          'The difference engine flagged modifications; top severity ' +
          `${context.changes.bySeverity.high} high, ${context.changes.bySeverity.medium} medium.`,
        severity:
          context.changes.bySeverity.high > 0
            ? 'high'
            : context.changes.bySeverity.medium > 0
              ? 'medium'
              : 'low',
        trend: 'mixed',
        recommendations: [
          'Prioritize the high-severity changes on the What Changed feed.',
          'Tie the biggest deltas to forecast assumptions before the next sync.',
        ],
        keyEntities: this.toKeyEntities(recordKeyEntities),
      });
    }

    if (findings.length === 0) {
      findings.push({
        layer: 'default',
        title: 'Everything looks stable',
        summary:
          'No material changes were detected between the last two snapshots.',
        severity: 'low',
        trend: 'flat',
        recommendations: [
          'Run the next refresh on your cadence to keep this monitoring fresh.',
        ],
        keyEntities: [],
      });
    }

    return findings;
  }
}