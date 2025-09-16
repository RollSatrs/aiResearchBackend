import { IsString, IsOptional, IsEnum, ValidateIf } from 'class-validator';
import { SearchProvider } from '../../search/dto/search.dto';

export class SummarizeDto {
    @ValidateIf(o => !o.text && !o.url)
    @IsString()
    paperId?: string;

    @IsOptional()
    @IsEnum(SearchProvider)
    provider?: SearchProvider = SearchProvider.SEMANTIC_SCHOLAR;

    @ValidateIf(o => !o.paperId && !o.url)
    @IsString()
    text?: string;

    @ValidateIf(o => !o.paperId && !o.text)
    @IsString()
    url?: string;
}

export interface RelatedPaper {
    id: string;
    title: string;
    url?: string;
    source: string;
}

export interface SummaryResponse {
    summary: string;
    keyIdeas: string[];
    relatedPapers?: RelatedPaper[];
}
