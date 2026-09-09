import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { EncryptionService } from '../encryption/encryption.service.js';
import { AuthProvider, User, UserDocument } from './user.schema.js';
import { SignUpDto, UserResponse } from './dto/sign-up.dto.js';

const BCRYPT_ROUNDS = 12;

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'stratveda timing-equalizer',
  BCRYPT_ROUNDS,
);

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(dto: SignUpDto): Promise<UserDocument> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.userModel.findOne({ email }).exec();
    if (existing) {
      throw new ConflictException(
        'An account with this email already exists',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const name = dto.name.trim();
    const nameEncrypted = await this.encryptionService.encrypt(name);

    const user = await this.userModel.create({
      name,
      nameEncrypted,
      email,
      passwordHash,
    });

    return user;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.trim().toLowerCase() }).exec();
  }

  async findBySocial(
    provider: AuthProvider,
    providerId: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ authProvider: provider, providerId })
      .exec();
  }

  async createFromSocial(input: {
    provider: AuthProvider;
    providerId: string;
    email: string;
    name: string;
    profileImage?: string;
    emailVerified?: boolean;
  }): Promise<{ user: UserDocument; created: boolean; linked: boolean }> {
    const email = input.email.trim().toLowerCase();

    // Never link or create an account when the identity provider explicitly
    // states the email is not verified. Doing so would allow an attacker to
    // take over an existing account using an unverified email match.
    if (input.emailVerified === false) {
      throw new UnauthorizedException(
        `Unable to verify the email provided by ${input.provider}. Please sign in with a verified email.`,
      );
    }

    // 1. Account already linked to this social identity.
    const existingSocial = await this.findBySocial(
      input.provider,
      input.providerId,
    );
    if (existingSocial) {
      await this.decryptPii(existingSocial);
      return { user: existingSocial, created: false, linked: true };
    }

    // 2. Email already used by a local (or other-provider) account -> link it.
    const existingByEmail = await this.findByEmail(email);
    if (existingByEmail) {
      existingByEmail.authProvider = input.provider;
      existingByEmail.providerId = input.providerId;
      existingByEmail.isEmailVerified = true;
      await existingByEmail.save();
      await this.decryptPii(existingByEmail);
      return { user: existingByEmail, created: false, linked: true };
    }

    // 3. Brand-new social user.
    const trimmedName = input.name.trim() || 'User';
    const nameEncrypted = await this.encryptionService.encrypt(trimmedName);
    const user = await this.userModel.create({
      name: trimmedName,
      nameEncrypted,
      email,
      profileImage: input.profileImage,
      authProvider: input.provider,
      providerId: input.providerId,
      isEmailVerified: input.emailVerified === true,
    });
    return { user, created: true, linked: false };
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  /**
   * Changes the user's password after verifying the current password.
   * Returns null when the account does not exist; throws when the account has
   * no password (social-only) or the current password is incorrect.
   */
  async changePassword(
    userId: string,
    dto: { currentPassword: string; newPassword: string },
  ): Promise<UserDocument | null> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      return null;
    }

    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account uses a social sign-in and does not have a password.',
      );
    }

    const currentMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentMatches) {
      throw new BadRequestException('Current password is incorrect');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await user.save();
    await this.decryptPii(user);
    return user;
  }

  async updateProfile(
    userId: string,
    updates: { name?: string },
  ): Promise<UserDocument | null> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      return null;
    }

    if (updates.name !== undefined) {
      const name = updates.name.trim();
      user.name = name;
      user.nameEncrypted = await this.encryptionService.encrypt(name);
    }

    await user.save();
    await this.decryptPii(user);
    return user;
  }

  async findByIdDecrypted(id: string): Promise<UserDocument | null> {
    const user = await this.userModel.findById(id).exec();
    if (user) {
      await this.decryptPii(user);
    }
    return user;
  }

  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<UserDocument | null> {
    const user = await this.findByEmail(email);
    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return null;
    }
    // Social-only accounts have no password and cannot sign in via email.
    if (!user.passwordHash) {
      return null;
    }
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (passwordMatches) {
      if (user.isBlocked) {
        throw new ForbiddenException(
          'This account has been blocked. Contact support for help.',
        );
      }
      await this.decryptPii(user);
    }
    return passwordMatches ? user : null;
  }

  async invalidateSessions(userId: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } })
      .exec();
  }

  private async decryptPii(user: UserDocument): Promise<void> {
    if (user.nameEncrypted) {
      try {
        user.name = await this.encryptionService.decrypt(user.nameEncrypted);
      } catch {
        // Fall back to stored plaintext name if the ciphertext cannot be
        // decoded (e.g. key rotation / backend switch). PII is still exposed
        // only to the authenticated owner via the API response.
      }
      delete user.nameEncrypted;
    }
  }

  private toResponse(user: UserDocument): UserResponse {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      profileImage: user.profileImage,
      authProvider: user.authProvider,
      isEmailVerified: user.isEmailVerified,
      companyId: user.companyId,
      hasCompany: Boolean(user.companyId),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  toPublicResponse(user: UserDocument): UserResponse {
    return this.toResponse(user);
  }
}