import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUserId } from '../auth/current-user.decorator.js';
import { AgentService } from './agent.service.js';

class AgentHistoryDto {
  @IsString()
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

export class AgentChatDto {
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty' })
  @MaxLength(4000, { message: 'Message cannot exceed 4000 characters' })
  content: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentHistoryDto)
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export class OnboardingAssessDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MaxLength(400, { each: true, message: 'A question is too long' })
  questions: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MaxLength(8000, { each: true, message: 'An answer is too long' })
  answers: string[];
}

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * Non-streaming chat. Returns the full answer at once.
   */
  @Post('chat')
  async chat(@CurrentUserId() _id: string, @Body() body: AgentChatDto) {
    return await this.agentService.chat({
      content: body.content,
      history: body.history,
    });
  }

  /**
   * Generates the one-by-one onboarding questions for the user's company.
   */
  @Post('onboarding/questions')
  async onboardingQuestions(@CurrentUserId() userId: string) {
    return await this.agentService.generateQuestions(userId);
  }

  /**
   * Produces and persists the Revenue Intelligence assessment from the
   * collected onboarding Q&A.
   */
  @Post('onboarding/assess')
  async onboardingAssess(
    @CurrentUserId() userId: string,
    @Body() body: OnboardingAssessDto,
  ) {
    return await this.agentService.assess(userId, {
      questions: body.questions,
      answers: body.answers,
    });
  }

  /**
   * Streaming chat (Server-Sent Events). Yields each token, finishing with [DONE].
   */
  @Post('chat/stream')
  async streamChat(
    @CurrentUserId() _id: string,
    @Body() body: AgentChatDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.status(HttpStatus.OK);

    const stream = this.agentService.stream({
      content: body.content,
      history: body.history,
    });

    try {
      for await (const token of stream) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
}
