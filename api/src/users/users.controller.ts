import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { LoginThrottleGuard } from '../auth/login-throttle.guard.js';
import {
  clearSessionCookie,
  getSessionCookie,
  setSessionCookie,
} from '../auth/session-cookie.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { SignInDto } from './dto/sign-in.dto.js';
import { SignUpDto, UserResponse } from './dto/sign-up.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';

@Controller('auth')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Post('signup')
  async signup(
    @Body() dto: SignUpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponse> {
    const user = await this.usersService.create(dto);
    const token = await this.jwtService.signAsync({
      sub: user.id,
      tv: user.tokenVersion,
    });
    setSessionCookie(res, getSessionCookie(this.configService), token);
    return this.usersService.toPublicResponse(user);
  }

  @Post('signin')
  @UseGuards(LoginThrottleGuard)
  async signin(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponse> {
    const user = await this.usersService.verifyCredentials(
      dto.email,
      dto.password,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const token = await this.jwtService.signAsync({
      sub: user.id,
      tv: user.tokenVersion,
    });
    setSessionCookie(res, getSessionCookie(this.configService), token);
    return this.usersService.toPublicResponse(user);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUserId() userId: string): Promise<UserResponse> {
    const user = await this.usersService.findByIdDecrypted(userId);
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    return this.usersService.toPublicResponse(user);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponse> {
    const user = await this.usersService.updateProfile(userId, dto);
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    return this.usersService.toPublicResponse(user);
  }

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUserId() userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<UserResponse> {
    const user = await this.usersService.changePassword(userId, dto);
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    return this.usersService.toPublicResponse(user);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUserId() userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.usersService.invalidateSessions(userId);
    clearSessionCookie(res, getSessionCookie(this.configService));
    return { message: 'Logged out' };
  }
}