import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/user.schema.js';
import { Company, CompanyDocument } from './company.schema.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { CompanyResponse } from './dto/company-response.dto.js';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  /**
   * Creates a company record and links it to the given user via the
   * `companyId` foreign key. The user's companyId is set only if the user
   * does not already belong to a company.
   */
  async createForUser(
    userId: string,
    dto: CreateCompanyDto,
  ): Promise<CompanyResponse> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new Error('User not found');
    }
    if (user.companyId) {
      const company = await this.companyModel
        .findById(user.companyId)
        .exec();
      if (company) {
        return this.toResponse(company);
      }
    }

    const company = await this.companyModel.create({
      name: dto.name.trim(),
      website: dto.website?.trim(),
      industry: dto.industry?.trim(),
      companySize: dto.companySize?.trim(),
      country: dto.country?.trim(),
      revenueRange: dto.revenueRange?.trim(),
      problemStatement: dto.problemStatement?.trim(),
    });

    await this.userModel
      .updateOne({ _id: userId }, { $set: { companyId: company._id } })
      .exec();

    return this.toResponse(company);
  }

  async findByOwner(userId: string): Promise<CompanyResponse | null> {
    const user = await this.userModel.findById(userId).exec();
    if (!user?.companyId) {
      return null;
    }
    const company = await this.companyModel.findById(user.companyId).exec();
    return company ? this.toResponse(company) : null;
  }

  /**
   * Updates the company owned by the given user. Returns null if the user has
   * no company. Only present fields are updated (partial update).
   */
  async updateForUser(
    userId: string,
    dto: UpdateCompanyDto,
  ): Promise<CompanyResponse | null> {
    const user = await this.userModel.findById(userId).exec();
    if (!user?.companyId) {
      return null;
    }

    const company = await this.companyModel
      .findById(user.companyId)
      .exec();
    if (!company) {
      return null;
    }

    if (dto.name !== undefined) company.name = dto.name.trim();
    if (dto.website !== undefined) company.website = dto.website?.trim();
    if (dto.industry !== undefined) company.industry = dto.industry?.trim();
    if (dto.companySize !== undefined)
      company.companySize = dto.companySize?.trim();
    if (dto.country !== undefined) company.country = dto.country?.trim();
    if (dto.revenueRange !== undefined)
      company.revenueRange = dto.revenueRange?.trim();
    if (dto.problemStatement !== undefined)
      company.problemStatement = dto.problemStatement?.trim();

    await company.save();

    return this.toResponse(company);
  }

  /**
   * Persists the completed onboarding assessment on the user's company.
   * Returns null when the user has no company record.
   */
  async saveAssessment(
    userId: string,
    data: { questions: string[]; answers: string[]; result: string },
  ): Promise<CompanyResponse | null> {
    const user = await this.userModel.findById(userId).exec();
    if (!user?.companyId) {
      return null;
    }

    const company = await this.companyModel.findById(user.companyId).exec();
    if (!company) {
      return null;
    }

    company.assessment = {
      questions: data.questions,
      answers: data.answers,
      result: data.result,
      createdAt: new Date(),
    };

    await company.save();

    return this.toResponse(company);
  }

  private toResponse(company: CompanyDocument): CompanyResponse {
    return {
      id: company._id.toString(),
      name: company.name,
      website: company.website,
      industry: company.industry,
      companySize: company.companySize,
      country: company.country,
      revenueRange: company.revenueRange,
      problemStatement: company.problemStatement,
      onboardingCompleted: Boolean(company.assessment),
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }
}
