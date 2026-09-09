import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import {
  AdminAuditLog,
  AdminAuditLogDocument,
  AdminUser,
  AdminUserDocument,
} from './admin.schemas.js';
import {
  ActivityQueryDto,
  AdminLoginDto,
  ListUsersQueryDto,
  UpdateUserDto,
} from './admin.dto.js';
import {
  ADMIN_COOKIE_NAME,
  AdminAuthGuard,
  AdminJwtPayload,
} from './admin-auth.guard.js';
import { CurrentAdmin } from './current-admin.decorator.js';
import { AdminService } from './admin.service.js';

export type AdminProfile = {
  id: string;
  email: string;
  name: string;
};

@Controller('admin')
export class AdminController {
  constructor(
    @InjectModel(AdminUser.name)
    private readonly userModel: Model<AdminUserDocument>,
    @InjectModel(AdminAuditLog.name)
    private readonly auditModel: Model<AdminAuditLogDocument>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly adminService: AdminService,
  ) {}

  private isAdminEmail(email: string): boolean {
    const admins = this.config
      .get<string>('ADMIN_EMAILS', '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    return admins.includes(email.trim().toLowerCase());
  }

  private cookieOptions() {
    const secure =
      this.config.get<string>('COOKIE_SECURE') === 'true' ||
      (this.config.get<string>('COOKIE_SECURE') === undefined &&
        process.env.NODE_ENV === 'production');
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure,
      path: '/',
      maxAge: Number(this.config.get<string>('ADMIN_SESSION_TTL', '604800')) * 1000,
    };
  }

  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminProfile> {
    if (!this.isAdminEmail(dto.email)) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const user = await this.userModel
      .findOne({ email: dto.email })
      .exec();
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.isBlocked) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.auditModel.create({
      event: 'auth.signin',
      actorType: 'user',
      actorId: String(user._id),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { scope: 'admin' },
    });

    const payload: AdminJwtPayload = {
      sub: String(user._id),
      email: user.email,
      tv: user.tokenVersion,
    };
    const token = await this.jwtService.signAsync(payload);
    res.cookie(ADMIN_COOKIE_NAME, token, this.cookieOptions());
    return { id: String(user._id), email: user.email, name: user.name };
  }

  @Post('auth/logout')
  @HttpCode(200)
  @UseGuards(AdminAuthGuard)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
    return { message: 'Logged out' };
  }

  @Get('auth/me')
  @UseGuards(AdminAuthGuard)
  async me(
    @CurrentAdmin() admin: { userId: string; email: string },
  ): Promise<AdminProfile> {
    const user = await this.userModel.findById(admin.userId).exec();
    if (!user) throw new NotFoundException('Admin account no longer exists');
    return { id: String(user._id), email: user.email, name: user.name };
  }

  @Get('stats')
  @UseGuards(AdminAuthGuard)
  stats() {
    return this.adminService.stats();
  }

  @Get('users')
  @UseGuards(AdminAuthGuard)
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  @UseGuards(AdminAuthGuard)
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Get('users/:id/activity')
  @UseGuards(AdminAuthGuard)
  activity(@Param('id') id: string, @Query() query: ActivityQueryDto) {
    return this.adminService.listActivity(id, query);
  }

  @Patch('users/:id')
  @UseGuards(AdminAuthGuard)
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @UseGuards(AdminAuthGuard)
  deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }
}