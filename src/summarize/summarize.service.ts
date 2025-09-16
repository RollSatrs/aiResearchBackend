import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { SummarizeDto, SummaryResponse, RelatedPaper } from './dto/summarize.dto';
import { SearchProvider } from '../search/dto/search.dto';
import OpenAI from 'openai';
import * as crypto from 'crypto';

@Injectable()
export class SummarizeService {
    private readonly logger = new Logger(SummarizeService.name);
    private openai: OpenAI;

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
        private searchService: SearchService,
    ) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not configured');
        }
        this.openai = new OpenAI({ apiKey });
    }

    async summarize(dto: SummarizeDto, userId: string): Promise<SummaryResponse> {
        let textToSummarize = '';
        let source = '';

        // Get text to summarize
        if (dto.paperId) {
            const cachedPaper = await this.getCachedPaper(dto.paperId, dto.provider);
            if (!cachedPaper) {
                throw new BadRequestException('Paper not found');
            }
            textToSummarize = cachedPaper.abstract || cachedPaper.title;
            source = 'abstract';
        } else if (dto.text) {
            textToSummarize = dto.text;
            source = 'text';
        } else if (dto.url) {
            // For now, just throw an error. In production, implement URL content extraction
            throw new BadRequestException('URL summarization not implemented yet');
        } else {
            throw new BadRequestException('Either paperId, text, or url must be provided');
        }

        // Generate input hash for deduplication
        const inputHash = this.generateInputHash(textToSummarize);

        // Check if summary already exists
        const existingSummary = await this.prisma.summary.findUnique({
            where: { inputHash },
        });

        if (existingSummary) {
            return {
                summary: existingSummary.summary,
                keyIdeas: JSON.parse(existingSummary.keyIdeas || '[]'),
                relatedPapers: [],
            };
        }

        // Generate summary using OpenAI
        const { summary, keyIdeas } = await this.generateSummary(textToSummarize);

        // Save summary to database
        await this.prisma.summary.create({
            data: {
                userId,
                paperId: dto.paperId,
                source,
                inputHash,
                summary,
                keyIdeas: JSON.stringify(keyIdeas),
            },
        });

        // Find related papers
        const relatedPapers = await this.findRelatedPapers(keyIdeas);

        return {
            summary,
            keyIdeas,
            relatedPapers,
        };
    }

    private async getCachedPaper(paperId: string, provider?: SearchProvider) {
        return this.prisma.paperCache.findUnique({
            where: { externalId: paperId },
        });
    }

    private generateInputHash(text: string): string {
        return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
    }

    private async generateSummary(text: string): Promise<{ summary: string; keyIdeas: string[] }> {
        try {
            const prompt = `Суммаризируй научный текст. Кратко, структурированно, без воды.

Текст для суммаризации:
${text}

Верни результат в формате JSON:
{
  "summary": "краткое описание 5-10 предложений",
  "keyIdeas": ["ключевая идея 1", "ключевая идея 2", "ключевая идея 3"]
}`;

            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 1000,
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('No response from OpenAI');
            }

            try {
                const parsed = JSON.parse(content);
                return {
                    summary: parsed.summary || 'Не удалось сгенерировать краткое описание',
                    keyIdeas: Array.isArray(parsed.keyIdeas) ? parsed.keyIdeas : [],
                };
            } catch (parseError) {
                // If JSON parsing fails, extract summary manually
                return {
                    summary: content.substring(0, 500) + '...',
                    keyIdeas: [],
                };
            }
        } catch (error) {
            this.logger.error(`Error generating summary: ${error.message}`);
            return {
                summary: 'Произошла ошибка при генерации краткого описания',
                keyIdeas: [],
            };
        }
    }

    private async findRelatedPapers(keyIdeas: string[]): Promise<RelatedPaper[]> {
        if (!keyIdeas.length) return [];

        try {
            // Search for related papers using key ideas
            const searchQuery = keyIdeas.slice(0, 3).join(' ');
            const searchResult = await this.searchService.search({
                q: searchQuery,
                provider: SearchProvider.SEMANTIC_SCHOLAR,
                limit: 5,
            });

            return searchResult.items.map(item => ({
                id: item.id,
                title: item.title,
                url: item.url,
                source: item.source,
            }));
        } catch (error) {
            this.logger.error(`Error finding related papers: ${error.message}`);
            return [];
        }
    }
}
