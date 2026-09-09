import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatMessage } from './llm.contract.js';
import { AzureOpenAIClient } from './azure-openai-client.js';
import { CompaniesService } from '../companies/companies.service.js';
import type { CompanyResponse } from '../companies/dto/company-response.dto.js';

export interface AgentChatInput {
  content: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface AgentChatResult {
  content: string;
}

export interface OnboardingInput {
  questions: string[];
  answers: string[];
}

const MAX_HISTORY = 8;

function parseJsonStringArray(content: string): string[] {
  const trimmed = content.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1].trim());

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object') {
        const list = (parsed as { questions?: unknown }).questions;
        if (Array.isArray(list)) {
          return list.filter((q): q is string => typeof q === 'string');
        }
      }
      if (Array.isArray(parsed)) {
        return parsed.filter((q): q is string => typeof q === 'string');
      }
    } catch {
      // try the next candidate representation
    }
  }
  return [];
}

/**
 * The StratVeda OS Master Prompt v4 is configured as the system instruction on
 * the deployed Azure AI Foundry model, so the backend does not inject its own
 * system prompt. It only forwards the conversation to Azure, which applies the
 * prompt itself.
 */
@Injectable()
export class AgentService {
  private readonly questionCount: number;

  constructor(
    private readonly azure: AzureOpenAIClient,
    private readonly companiesService: CompaniesService,
    config: ConfigService,
  ) {
    const count = Number(config.get<string>('ONBOARDING_QUESTION_COUNT') ?? '6');
    this.questionCount = Number.isFinite(count)
      ? Math.min(15, Math.max(3, Math.round(count)))
      : 6;
  }

  buildMessages(input: AgentChatInput): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const item of input.history ?? []) {
      messages.push({ role: item.role, content: item.content });
    }

    messages.push({ role: 'user', content: input.content });
    return messages.slice(-(MAX_HISTORY + 1));
  }

  async chat(input: AgentChatInput): Promise<AgentChatResult> {
    const content = await this.azure.complete(this.buildMessages(input));
    return { content };
  }

  async *stream(input: AgentChatInput): AsyncGenerator<string, void, undefined> {
    yield* this.azure.streamTokens(this.buildMessages(input));
  }

  private buildCompanyProfile(company: CompanyResponse): string {
    const lines = [
      `- Name: ${company.name}`,
      company.website ? `- Website: ${company.website}` : '',
      company.industry ? `- Industry: ${company.industry}` : '',
      company.companySize ? `- Company size: ${company.companySize}` : '',
      company.country ? `- Country: ${company.country}` : '',
      company.revenueRange
        ? `- Annual revenue range: ${company.revenueRange}`
        : '',
      company.problemStatement
        ? `- Problem statement / query: ${company.problemStatement}`
        : '',
    ];
    return lines.filter(Boolean).join('\n');
  }

  private buildQuestionsPrompt(company: CompanyResponse, count: number): string {
    return [
      'You are conducting a structured Revenue Intelligence onboarding interview with a business owner.',
      '',
      'Company profile:',
      this.buildCompanyProfile(company),
      '',
      `Based strictly on the company profile above, generate exactly ${count} concise, high-value questions to better understand the business before producing a Revenue Intelligence assessment. Each question must be self-contained (understandable on its own), and relevant to revenue, sales, pricing, customers, or operations.`,
      '',
      'Respond with ONLY a JSON object in this exact shape:',
      '{"questions":["question 1","question 2", ...]}',
      'Do not include markdown fences, commentary, or anything other than the JSON object.',
    ].join('\n');
  }

  private buildAssessmentPrompt(
    company: CompanyResponse,
    questions: string[],
    answers: string[],
  ): string {
    const qa = questions
      .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i] ?? '(no answer)'}`)
      .join('\n\n');
    return [
      `You have just completed a Revenue Intelligence onboarding interview with ${company.name}.`,
      '',
      'Company profile:',
      this.buildCompanyProfile(company),
      '',
      'Interview answers:',
      qa,
      '',
      "Based on the company profile and the interview answers, produce a detailed Revenue Intelligence assessment following the system's assessment format — findings, priorities, and recommended actions. Be specific and practical for this business.",
    ].join('\n');
  }

  private buildFallbackAssessment(
    company: CompanyResponse,
    questions: string[],
    answers: string[],
  ): string {
    const learnings = questions
      .map((q, i) => `- **${q}**\n  ${answers[i]?.trim() || 'Not answered.'}`)
      .join('\n');
    return [
      '> Note: The live intelligence engine was briefly unavailable, so this assessment was compiled from your profile and answers. Ask your agent for a deeper analysis anytime.',
      '',
      `### Revenue Intelligence Assessment — ${company.name}`,
      '',
      '**Company snapshot**',
      this.buildCompanyProfile(company),
      '',
      '**What we learned**',
      learnings,
      '',
      '**Priority focus areas**',
      '1. **Own your funnel metrics** — instrument conversion at each stage so losses are visible before deciding where to invest.',
      '2. **Tighten the offer-to-value story** — clarify pricing objections and champion dynamics at the stages where deals stall.',
      '3. **Make pipeline data trustworthy** — standardize how interactions, pipeline changes, and loss reasons are captured.',
      '',
      '**Recommended first actions**',
      '- Define the conversion and velocity metrics you will track weekly.',
      '- Review target segment and pricing guidance with sales to remove ambiguity.',
      '- Fund the 2–3 highest-leverage actions, assign owners, and set a 30-day review.',
      '',
      'Ready to go deeper? Ask your agent for a full diagnostic on any of these areas.',
    ].join('\n');
  }

  /**
   * Runs a single Foundry completion with one retry on transient network
   * failures (connection resets, timeouts, dropped fetches).
   */
  private async completeWithRetry(prompt: string): Promise<string> {
    let lastError: unknown = new Error('unknown error');
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await this.azure.complete([{ role: 'user', content: prompt }]);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : '';
        const transient =
          message.includes('fetch failed') ||
          message.includes('ECONNRESET') ||
          message.includes('ETIMEDOUT') ||
          message.includes('timed out') ||
          message.includes('socket hang up');
        if (!transient || attempt === 2) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw lastError;
  }

  /**
   * Generates the one-by-one onboarding questions for the user's company by
   * asking the deployed model to return a JSON list of questions.
   */
  async generateQuestions(userId: string): Promise<{ questions: string[] }> {
    const company = await this.companiesService.findByOwner(userId);
    if (!company) {
      throw new NotFoundException(
        'No company profile found. Complete company setup first.',
      );
    }

    let content: string;
    try {
      content = await this.completeWithRetry(
        this.buildQuestionsPrompt(company, this.questionCount),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(
        `Unable to prepare your onboarding questions right now. ${message}`,
      );
    }

    const questions = parseJsonStringArray(content).filter(
      (q) => {
        const len = q.trim().length;
        return len > 0 && len <= 400;
      },
    );

    if (questions.length === 0) {
      throw new ServiceUnavailableException(
        'The intelligence engine did not return any onboarding questions.',
      );
    }

    return { questions };
  }

  /**
   * Builds the Revenue Intelligence assessment from the collected Q&A, persists
   * it on the company record, and returns the raw result for display.
   */
  async assess(userId: string, input: OnboardingInput): Promise<{ result: string }> {
    const questions = input.questions.filter((q) => typeof q === 'string');
    const answers = input.answers.filter((a) => typeof a === 'string');

    if (questions.length === 0 || questions.length !== answers.length) {
      throw new BadRequestException(
        'Every question must have a matching answer.',
      );
    }

    const company = await this.companiesService.findByOwner(userId);
    if (!company) {
      throw new NotFoundException(
        'No company profile found. Complete company setup first.',
      );
    }

    let content = '';
    try {
      content = await this.completeWithRetry(
        this.buildAssessmentPrompt(company, questions, answers),
      );
    } catch {
      // The engine is unavailable or exhausted right now. Degrade gracefully
      // to a deterministic assessment built from the company profile and the
      // collected answers so the onboarding flow always completes.
      content = this.buildFallbackAssessment(company, questions, answers);
    }

    if (!content.trim()) {
      content = this.buildFallbackAssessment(company, questions, answers);
    }

    await this.companiesService.saveAssessment(userId, {
      questions,
      answers,
      result: content,
    });

    return { result: content };
  }
}
