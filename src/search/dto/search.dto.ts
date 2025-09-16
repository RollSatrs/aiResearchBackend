import { IsString, IsOptional, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export enum SearchProvider {
    SEMANTIC_SCHOLAR = 'semantic_scholar',
    ARXIV = 'arxiv',
    PUBMED = 'pubmed',
    GOOGLE_SCHOLAR = 'google_scholar',
    CROSSREF = 'crossref',
    WEB_SEARCH = 'web_search',
    ALL_SOURCES = 'all_sources', // Поиск по всем источникам
} export class SearchDto {
    @IsString()
    q: string;

    @IsOptional()
    @IsEnum(SearchProvider)
    provider?: SearchProvider = SearchProvider.SEMANTIC_SCHOLAR;

    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsNumber()
    @Min(1)
    @Max(50)
    limit?: number = 10;
}

export interface SearchResultItem {
    id: string;
    source: string;
    title: string;
    authors: string[];
    abstract?: string;
    url?: string;
    year?: number;
}

export interface SearchResponse {
    items: SearchResultItem[];
    totalFound?: number;
    searchTime?: number;
    sources?: string[];
}

// Новые DTO для Deep Research
export class DeepResearchDto {
    @IsString()
    topic: string;

    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsNumber()
    @Min(10)
    @Max(200)
    maxSources?: number = 50;

    @IsOptional()
    @IsString()
    researchDepth?: 'quick' | 'standard' | 'deep' = 'standard';

    @IsOptional()
    @IsString()
    language?: 'ru' | 'en' | 'any' = 'any';
}

export interface ResearchProgress {
    stage: string;
    progress: number; // 0-100
    currentAction: string;
    sourcesFound: number;
    errors?: string[];
}

export interface DeepResearchResponse {
    researchId: string;
    topic: string;
    progress: ResearchProgress;
    sources: SearchResultItem[];
    report?: string; // Готовый реферат
    bibliography?: CitationItem[];
}

export interface CitationItem {
    id: string;
    title: string;
    authors: string[];
    year?: number;
    journal?: string;
    doi?: string;
    url?: string;
    citationFormat: string; // APA, MLA, etc.
    reliability: 'high' | 'medium' | 'low';
}