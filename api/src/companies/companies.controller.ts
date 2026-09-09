import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CompaniesService } from './companies.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { CompanyResponse } from './dto/company-response.dto.js';

@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateCompanyDto,
  ): Promise<CompanyResponse> {
    const company = await this.companiesService.createForUser(userId, dto);
    return company;
  }

  @Get('me')
  async getMyCompany(
    @CurrentUserId() userId: string,
  ): Promise<CompanyResponse | null> {
    const company = await this.companiesService.findByOwner(userId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  @Patch('me')
  async updateMyCompany(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateCompanyDto,
  ): Promise<CompanyResponse | null> {
    const company = await this.companiesService.updateForUser(userId, dto);
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }
}
