import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchDto, DeepResearchDto, SearchProvider, ArticleAnalysis } from './dto/search.dto';

@Controller('search')
export class SearchController {
    constructor(private searchService: SearchService) { }

    @Get()
    search(@Query() dto: SearchDto) {
        return this.searchService.search(dto);
    }

    @Post('deep-research')
    async deepResearch(@Body() dto: DeepResearchDto) {
        // Пока используем обычный поиск по всем источникам
        const searchResult = await this.searchService.search({
            q: dto.topic,
            provider: SearchProvider.ALL_SOURCES,
            limit: dto.maxSources || 50
        });

        return {
            topic: dto.topic,
            researchDepth: dto.researchDepth,
            totalSources: searchResult.sources?.length || 0,
            totalResults: searchResult.items.length,
            sources: searchResult.sources || [],
            papers: searchResult.items,
            searchTime: searchResult.searchTime
        };
    }

}
