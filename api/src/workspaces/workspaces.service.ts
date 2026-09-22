import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/user.schema.js';
import { Company } from '../companies/company.schema.js';
import {
  Workspace,
  WorkspaceDocument,
  WorkspaceSettings,
} from './workspace.schema.js';

/**
 * Workspace resolver. The current data model ties each user to a single
 * company via `user.companyId`; a workspace is a first-class record that
 * scopes connector connections, consents, syncs, snapshots, changes,
 * findings and action plans. Every workspace is owned by exactly one user.
 */
@Injectable()
export class WorkspacesService {
  constructor(
    @InjectModel(Workspace.name)
    private readonly workspaceModel: Model<WorkspaceDocument>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Company.name) private readonly companyModel: Model<Company>,
  ) {}

  /** Resolves (and lazily creates) the workspace owned by this user. */
  async resolveForUser(userId: string): Promise<string> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.workspaceModel
      .findOne({ ownerId: userId })
      .exec();
    if (existing) {
      return existing._id.toString();
    }

    const company = user.companyId
      ? await this.companyModel.findById(user.companyId).exec()
      : null;

    const workspace = await this.workspaceModel.create({
      ownerId: userId,
      companyId: user.companyId ?? undefined,
      name: company?.name ?? `${user.name}'s workspace`,
      createdBy: userId,
      settings: { syncCadenceMinutes: 1440, autoSyncOnRefresh: true, retentionDays: 365 },
    });

    return workspace._id.toString();
  }

  /** Verifies `workspaceId` is owned by `userId`; throws otherwise. */
  async requireOwned(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.workspaceModel
      .findOne({ _id: workspaceId, ownerId: userId })
      .exec();
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
  }

  async findByOwner(userId: string): Promise<WorkspaceDocument | null> {
    return this.workspaceModel.findOne({ ownerId: userId }).exec();
  }

  async updateSettings(
    workspaceId: string,
    userId: string,
    settings: Partial<WorkspaceSettings>,
  ): Promise<WorkspaceSettings> {
    await this.requireOwned(workspaceId, userId);
    const workspace = await this.workspaceModel
      .findOneAndUpdate(
        { _id: workspaceId },
        { $set: { settings } },
        { new: true },
      )
      .exec();
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace.settings ?? {};
  }
}