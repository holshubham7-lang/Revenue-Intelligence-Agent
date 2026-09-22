import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import {
  OAuthState,
  OAuthStateDocument,
} from './oauth-state.schema.js';

export interface CreatedState {
  state: string;
  expiresAt: Date;
}

@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);

  constructor(
    @InjectModel(OAuthState.name)
    private readonly stateModel: Model<OAuthStateDocument>,
  ) {}

  static hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }

  async create(input: {
    workspaceId: string;
    connectorSlug: string;
    connectionId: string;
  }): Promise<CreatedState> {
    const state = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.stateModel.create({
      workspaceId: input.workspaceId,
      connectorSlug: input.connectorSlug,
      connectionId: input.connectionId,
      stateHash: OAuthStateService.hashState(state),
      expiresAt,
    });
    return { state, expiresAt };
  }

  /**
   * Validates a returned state string: exists, unexpired, unused, and matches
   * the expected connector/connection. Marks the token used on success.
   */
  async consume(input: {
    state: string;
    connectorSlug: string;
    connectionId: string;
  }): Promise<OAuthStateDocument> {
    const record = await this.stateModel
      .findOne({ stateHash: OAuthStateService.hashState(input.state) })
      .exec();
    if (!record || record.used) {
      this.logger.warn('OAuth state validation failed: unknown or reused state');
      throw new Error('Invalid or reused OAuth state');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      this.logger.warn('OAuth state validation failed: expired state');
      throw new Error('OAuth state expired');
    }
    if (
      record.connectorSlug !== input.connectorSlug ||
      record.connectionId !== input.connectionId
    ) {
      this.logger.warn('OAuth state validation failed: connector mismatch');
      throw new Error('OAuth state does not match the requested connector');
    }
    await this.stateModel
      .updateOne({ _id: record._id }, { $set: { used: true } })
      .exec();
    return record;
  }

  async consumeByState(state: string): Promise<OAuthStateDocument> {
    const record = await this.stateModel
      .findOne({ stateHash: OAuthStateService.hashState(state) })
      .exec();
    if (!record || record.used) {
      throw new Error('Invalid or reused OAuth state');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new Error('OAuth state expired');
    }
    await this.stateModel
      .updateOne({ _id: record._id }, { $set: { used: true } })
      .exec();
    return record;
  }
}