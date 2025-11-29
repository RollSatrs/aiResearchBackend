import { Body, Controller, Post } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import type { AnalyzePaperDto } from './dto/analyze-paper.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('article')
  async analyticsArticle(@Body() params:AnalyzePaperDto) {
    const analyticsResult = await this.analyticsService.analyticsArticle(params)
    return {
      success: true,
      data: analyticsResult,
    };

  }

}
