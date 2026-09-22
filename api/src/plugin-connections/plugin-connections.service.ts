import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PluginConnection,
  PluginConnectionDocument,
  ConnectionStatus,
  HydratedDataStatus,
} from './plugin-connection.schema.js';
import { UserPlugin, UserPluginDocument } from '../plugins/user-plugin.schema.js';
import { EncryptionService } from '../encryption/encryption.service.js';
import { PluginConsentsService } from '../plugin-consents/plugin-consents.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ConnectorMetadata } from '../plugins/plugins.service.js';

export interface CreateConnectionInput {
  workspaceId: string;
  connector: ConnectorMetadata;
  createdByUserId: string;
  oauthRedirectUrl?: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresInSeconds?: number;
  providerAccountId?: string;
  accountName?: string;
}

export interface ConnectionView {
  id: string;
  workspaceId: string;
  connectorSlug: string;
  connectorName?: string;
  azureConnectionName?: string;
  status: ConnectionStatus;
  hydratedDataStatus?: HydratedDataStatus;
  accountName?: string;
  readScopes?: string[];
  connectedAt?: Date;
  lastSyncedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  connector?: {
    name?: string;
    mark?: string;
    brandColor?: string;
    iconUrl?: string;
    category?: string;
    capabilities?: string[];
  };
}

@Injectable()
export class PluginConnectionsService {
  constructor(
    @InjectModel(PluginConnection.name)
    private readonly connectionModel: Model<PluginConnectionDocument>,
    @InjectModel(UserPlugin.name)
    private readonly userPluginModel: Model<UserPluginDocument>,
    private readonly encryptionService: EncryptionService,
    private readonly consentsService: PluginConsentsService,
    private readonly auditService: AuditService,
  ) {}

  async create(input: CreateConnectionInput): Promise<PluginConnectionDocument> {
    const doc = await this.connectionModel.create({
      workspaceId: input.workspaceId,
      connectorSlug: input.connector.slug,
      connectorName: input.connector.slug,
      status: 'pending',
      hydratedDataStatus: 'not_initialized',
      readScopes: input.connector.scopes ?? [],
      createdBy: input.createdByUserId,
      oauthRedirectUrl: input.oauthRedirectUrl,
    });

    await this.userPluginModel
      .updateOne(
        { userId: input.createdByUserId, pluginSlug: input.connector.slug },
        {
          $set: {
            status: 'pending',
            connectorName: input.connector.slug,
            scopes: input.connector.scopes ?? [],
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      )
      .exec();

    return doc;
  }

  async requireOwned(workspaceId: string, connectionId: string) {
    const connection = await this.connectionModel
      .findOne({ _id: connectionId, workspaceId })
      .select('+encryptedAccessToken +encryptedRefreshToken')
      .exec();
    if (!connection) {
      throw new NotFoundException('Connection not found');
    }
    return connection;
  }

  async findById(
    workspaceId: string,
    connectionId: string,
  ): Promise<PluginConnectionDocument> {
    return this.requireOwned(workspaceId, connectionId);
  }

  async findByWorkspaceAndSlug(
    workspaceId: string,
    connectorSlug: string,
  ): Promise<PluginConnectionDocument | null> {
    return this.connectionModel
      .findOne({ workspaceId, connectorSlug })
      .select('+encryptedAccessToken +encryptedRefreshToken')
      .exec();
  }

  async listForWorkspace(workspaceId: string): Promise<PluginConnectionDocument[]> {
    return this.connectionModel
      .find({ workspaceId })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
  }

  toView(connection: PluginConnectionDocument): ConnectionView {
    return {
      id: connection._id.toString(),
      workspaceId: connection.workspaceId,
      connectorSlug: connection.connectorSlug,
      connectorName: connection.connectorName,
      azureConnectionName: connection.azureConnectionName,
      status: connection.status,
      hydratedDataStatus: connection.hydratedDataStatus,
      accountName: connection.accountName,
      readScopes: connection.readScopes,
      connectedAt: connection.connectedAt,
      lastSyncedAt: connection.lastSyncedAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  async setStatus(
    connectionId: string,
    status: ConnectionStatus,
  ): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (status === 'active') patch.connectedAt = new Date();
    await this.connectionModel
      .findByIdAndUpdate(connectionId, { $set: patch })
      .exec();
  }

  async setAzureRef(
    connectionId: string,
    ref: { azureConnectionName: string; azureRegion?: string },
  ): Promise<void> {
    await this.connectionModel
      .findByIdAndUpdate(connectionId, {
        $set: {
          azureConnectionName: ref.azureConnectionName,
          azureRegion: ref.azureRegion,
        },
      })
      .exec();
  }

  async setHydratedStatus(
    connectionId: string,
    status: HydratedDataStatus,
  ): Promise<void> {
    await this.connectionModel
      .findByIdAndUpdate(connectionId, { $set: { hydratedDataStatus: status } })
      .exec();
  }

  async setAccount(
    connectionId: string,
    account: { providerAccountId?: string; accountName?: string },
  ): Promise<void> {
    await this.connectionModel
      .findByIdAndUpdate(connectionId, {
        $set: {
          providerAccountId: account.providerAccountId,
          accountName: account.accountName,
        },
      })
      .exec();
  }

  /** Persists encrypted access/refresh tokens and refresh schedule. */
  async persistTokens(connectionId: string, tokens: TokenSet): Promise<void> {
    const [encryptedAccess, encryptedRefresh] = await Promise.all([
      this.encryptionService.encrypt(tokens.accessToken),
      tokens.refreshToken
        ? this.encryptionService.encrypt(tokens.refreshToken)
        : null,
    ]);

    const expiresAt = tokens.expiresInSeconds
      ? new Date(Date.now() + tokens.expiresInSeconds * 1000)
      : undefined;

    await this.connectionModel.findByIdAndUpdate(connectionId, {
      $set: {
        encryptedAccessToken: JSON.stringify(encryptedAccess),
        encryptedRefreshToken: encryptedRefresh
          ? JSON.stringify(encryptedRefresh)
          : undefined,
        tokenType: tokens.tokenType ?? 'Bearer',
        expiresAt,
        nextRefreshAt: expiresAt ? new Date(expiresAt.getTime() - 5 * 60 * 1000) : undefined,
        providerAccountId: tokens.providerAccountId,
        accountName: tokens.accountName,
      },
    }).exec();
  }

  async touchSync(
    connectionId: string,
    options?: { hydratedDataStatus?: HydratedDataStatus },
  ): Promise<void> {
    await this.connectionModel
      .findByIdAndUpdate(connectionId, {
        $set: {
          lastSyncedAt: new Date(),
          status: 'active',
          hydratedDataStatus: options?.hydratedDataStatus ?? 'hydrated',
        },
      })
      .exec();
  }

  async getDecryptedTokens(
    connection: PluginConnectionDocument,
  ): Promise<{ accessToken: string | null; refreshToken: string | null }> {
    const accessToken = connection.encryptedAccessToken
      ? await this.decryptToken(connection.encryptedAccessToken)
      : null;
    const refreshToken = connection.encryptedRefreshToken
      ? await this.decryptToken(connection.encryptedRefreshToken)
      : null;
    return { accessToken, refreshToken };
  }

  async clearTokens(connectionId: string): Promise<void> {
    await this.connectionModel
      .findByIdAndUpdate(connectionId, {
        $unset: {
          encryptedAccessToken: 1,
          encryptedRefreshToken: 1,
          expiresAt: 1,
          nextRefreshAt: 1,
        },
      })
      .exec();
  }

  /** Marks a connection as revoked and clears all token material. */
  async finalizeRevoke(
    connectionId: string,
    input: {
      workspaceId: string;
      actorId?: string;
      reason?: string;
    },
  ): Promise<void> {
    const connection = await this.connectionModel
      .findById(connectionId)
      .exec();
    if (connection) {
      if (connection.createdBy && connection.connectorSlug) {
        await this.markLegacyUserPlugin(
          connection.createdBy,
          connection.connectorSlug,
          'disconnected',
        );
      }
      await this.connectionModel
        .findByIdAndUpdate(connectionId, {
          $set: {
            status: 'revoked',
            hydratedDataStatus: 'not_initialized',
          },
        })
        .exec();
    }
    await this.clearTokens(connectionId);

    await this.auditService.record({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'revoked',
      category: 'connection',
      targetType: 'plugin_connection',
      targetId: connectionId,
      message: 'Connection revoked and tokens removed',
      metadata: { reason: input.reason },
    });
  }

  async markLegacyUserPlugin(
    userId: string,
    connectorSlug: string,
    status: 'pending' | 'connected' | 'disconnected',
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };
    if (status === 'connected') patch.connectedAt = new Date();
    await this.userPluginModel
      .updateOne(
        { userId, pluginSlug: connectorSlug },
        { $set: patch },
        { upsert: true },
      )
      .exec();
  }

  private async decryptToken(encryptedJson: string): Promise<string | null> {
    try {
      const field = JSON.parse(encryptedJson) as {
        iv: string;
        tag: string;
        data: string;
      };
      return await this.encryptionService.decrypt(field);
    } catch {
      return null;
    }
  }
}