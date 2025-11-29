import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnalyzePaperDto } from './dto/analyze-paper.dto';
import OpenAI from 'openai';

@Injectable()
export class AnalyticsService {
  private openai: OpenAI;

  constructor(private prisma: PrismaService) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async analyticsArticle(paper: AnalyzePaperDto) {
    if (!paper.abstract) {
      throw new InternalServerErrorException('Отсутствует abstract');
    }

    try {
      const prompt = `
Ты — аналитическая модель. Проанализируй abstract научной статьи.

!!! ВАЖНО !!!
Ответ верни строго в формате JSON.
НЕ пиши текст вне JSON. НЕ добавляй пояснения.

Формат ответа:

{
  "summary": "краткое резюме",
  "keyWords": ["слово1", "слово2", "..."],
  "topic": "1–2 фразы о тематике статьи"
}

Вот текст для анализа:
${paper.abstract}
      `;

      const result = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Ты — аналитик научных статей.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });

      const jsonText = result.choices[0].message?.content;

      console.log('=== OpenAI response ===');
      console.log(jsonText);
      console.log('=======================');

      if (!jsonText) {
        throw new InternalServerErrorException('OpenAI вернул пустой ответ');
      }

      // Парсим JSON
      const analysisData = JSON.parse(jsonText);
      console.log(analysisData  )

      return {
        ...paper,
        summary: analysisData.summary,
        keyWords: analysisData.keyWords,
        topic: analysisData.topic,
      };

    } catch (error) {
      console.error('Error analyzing article:', error);
      throw new InternalServerErrorException('Ошибка при анализе статьи');
    }
  }
}
