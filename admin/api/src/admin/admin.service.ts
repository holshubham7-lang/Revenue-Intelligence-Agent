import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import {
  AdminAuditLog,
  AdminAuditLogDocument,
  AdminUser,
  AdminUserDocument,
} from './admin.schemas.js';
import {
  ActivityQueryDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './admin.dto.js';
import { FieldDecryptService } from './field-decrypt.service.js';

const BCRYPT_ROUNDS = 12;

export interface AdminUserView {
  id: string;
  name: string;
  nameDecrypted: boolean;
  email: string;
  profileImage?: string;
  authProvider: string;
  providerId?: string;
  isEmailVerified: boolean;
  isBlocked: boolean;
  isTestAccount: boolean;
  isAdmin: boolean;
  companyId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ActivityItem {
  id: string;
  event: string;
  actorType: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(AdminUser.name)
    private readonly userModel: Model<AdminUserDocument>,
    @InjectModel(AdminAuditLog.name)
    private readonly auditModel: Model<AdminAuditLogDocument>,
    private readonly fieldDecrypt: FieldDecryptService,
    private readonly config: ConfigService,
  ) {}

  /** admin accounts listed in ADMIN_EMAILS + flagged test accounts */
  private scopeFilter(includeTest: boolean): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    if (!includeTest) {
      filter.isTestAccount = { $ne: true };
      const emails = (this.config.get<string>('ADMIN_EMAILS') ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      if (emails.length > 0) filter.email = { $nin: emails };
    }
    return filter;
  }

  async stats() {
    const real = this.scopeFilter(false);
    const blockedFilter = { ...real, isBlocked: true };
    const verifiedFilter = { ...real, isEmailVerified: true };
    const unverifiedFilter = { ...real, isEmailVerified: false };

    const [total, blocked, verified, unverified, byProvider, last7, last30] =
      await Promise.all([
        this.userModel.countDocuments(real).exec(),
        this.userModel.countDocuments(blockedFilter).exec(),
        this.userModel.countDocuments(verifiedFilter).exec(),
        this.userModel.countDocuments(unverifiedFilter).exec(),
        Promise.all(
          (['email', 'google', 'microsoft', 'linkedin'] as const).map(
            async (provider) => ({
              provider,
              count: await this.userModel
                .countDocuments({ ...real, authProvider: provider })
                .exec(),
            }),
          ),
        ),
        this.sinceDays(7, real),
        this.sinceDays(30, real),
      ]);

    return {
      total,
      blocked,
      verified,
      unverified,
      byProvider,
      signedUp: { last7Days: last7, last30Days: last30 },
    };
  }

  async listUsers(query: ListUsersQueryDto) {
    const includeTest = query.includeTest === true;
    const filter: Record<string, unknown> = this.scopeFilter(includeTest);
    if (query.provider) filter.authProvider = query.provider;
    if (query.emailVerified !== undefined) {
      filter.isEmailVerified = query.emailVerified;
    }
    if (query.blocked !== undefined) {
      filter.isBlocked = query.blocked;
    }
    if (query.search) {
      const rx = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const sortBy = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDir === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortDir };
    if (sortBy !== 'createdAt') sort.createdAt = -1;

    const [docs, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((doc) => this.toView(doc)),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      sortBy,
      sortDir: sortDir === 1 ? 'asc' : 'desc',
    };
  }

  async getUser(id: string): Promise<AdminUserView> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    return this.toView(user);
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Name cannot be empty');
      user.name = name;
      user.nameEncrypted = undefined;
    }
    if (dto.isEmailVerified !== undefined) {
      user.isEmailVerified = dto.isEmailVerified;
    }
    if (dto.isBlocked !== undefined) {
      if (user.isBlocked !== dto.isBlocked) {
        user.isBlocked = dto.isBlocked;
        user.tokenVersion += 1; // revoke all sessions (main + admin)
      }
    }
    if (dto.newPassword !== undefined) {
      user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
      user.tokenVersion += 1;
    }

    await user.save();
    return this.toView(user);
  }

  async deleteUser(id: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    await this.userModel.deleteOne({ _id: id }).exec();
    await this.auditModel
      .updateMany({ actorId: id }, { actorId: undefined })
      .exec();
    return { id };
  }

  async listActivity(id: string, query: ActivityQueryDto) {
    const filter: Record<string, unknown> = { actorId: id };
    if (query.event) filter.event = query.event;

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);

    const [docs, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      this.auditModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((doc): ActivityItem => ({
        id: String(doc._id),
        event: doc.event,
        actorType: doc.actorType,
        ip: doc.ip,
        userAgent: doc.userAgent,
        metadata: doc.metadata,
        createdAt: doc.createdAt,
      })),
      total,
      limit,
      offset,
    };
  }

  private async sinceDays(days: number, scope: Record<string, unknown>): Promise<number> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.userModel
      .countDocuments({ ...scope, createdAt: { $gte: since } })
      .exec();
  }

  private isAdminEmail(email: string): boolean {
    const emails = (this.config.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return emails.includes(email.toLowerCase());
  }

  private toView(doc: AdminUserDocument): AdminUserView {
    let name = doc.name;
    let nameDecrypted = false;
    if (doc.nameEncrypted) {
      const decrypted = this.fieldDecrypt.decrypt(doc.nameEncrypted);
      if (decrypted !== null) {
        name = decrypted;
        nameDecrypted = true;
      }
    }
    return {
      id: String(doc._id),
      name,
      nameDecrypted,
      email: doc.email,
      profileImage: doc.profileImage,
      authProvider: doc.authProvider,
      providerId: doc.providerId,
      isEmailVerified: doc.isEmailVerified,
      isBlocked: doc.isBlocked,
      isTestAccount: doc.isTestAccount === true,
      isAdmin: this.isAdminEmail(doc.email),
      companyId: doc.companyId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}