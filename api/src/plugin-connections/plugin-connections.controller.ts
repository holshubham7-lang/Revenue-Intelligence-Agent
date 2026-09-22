import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { PluginsService, ConnectorMetadata } from '../plugins/plugins.service.js';
import {
  PluginConnectionsService,
  ConnectionView,
} from './plugin-connections.service.js';

@Controller('connections')
@UseGuards(JwtAuthGuard)
export class PluginConnectionsController {
  constructor(
    private readonly connectionsService: PluginConnectionsService,
    private readonly workspacesService: WorkspacesService,
    private readonly pluginsService: PluginsService,
  ) {}

  @Get()
  async list(@CurrentUserId() userId: string): Promise<ConnectionView[]> {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    const connections = await this.connectionsService.listForWorkspace(workspaceId);
    const views = connections.map((c) => this.connectionsService.toView(c));

    const connectorSummaries = new Map(
      (
        await Promise.all(
          [...new Set(views.map((v) => v.connectorSlug))].map((slug) =>
            this.pluginsService
              .findConnector(slug)
              .then((c) => [slug, c] as const)
              .catch(() => null),
          ),
        )
      )
        .filter((x): x is readonly [string, ConnectorMetadata] => x !== null)
        .map(([slug, connector]) => [slug, connector] as const),
    );

    for (const view of views) {
      const metadata = connectorSummaries.get(view.connectorSlug);
      view.connector = {
        name: metadata?.name,
        mark: metadata?.mark,
        brandColor: metadata?.brandColor,
        iconUrl: metadata?.iconUrl,
        category: metadata?.category,
        capabilities: metadata?.capabilities ?? [],
      };
    }
    return views;
  }

  @Get(':connectionId')
  async getOne(
    @CurrentUserId() userId: string,
    @Param('connectionId') connectionId: string,
  ): Promise<ConnectionView & { connector?: Record<string, unknown> }> {
    const workspaceId = await this.workspacesService.resolveForUser(userId);
    const connection = await this.connectionsService.findById(
      workspaceId,
      connectionId,
    );
    const view = this.connectionsService.toView(connection);
    const metadata = await this.pluginsService
      .findConnector(view.connectorSlug)
      .catch(() => null);
    view.connector = metadata
      ? {
          name: metadata.name,
          mark: metadata.mark,
          brandColor: metadata.brandColor,
          iconUrl: metadata.iconUrl,
          category: metadata.category,
          capabilities: metadata.capabilities ?? [],
        }
      : undefined;
    return view;
  }
}