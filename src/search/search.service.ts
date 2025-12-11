import { Injectable, Logger } from '@nestjs/common';
import { SearchDto, SearchResponse, SearchResultItem, SearchProvider } from './dto/search.dto';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name);

    constructor(private prisma: PrismaService) { }

    async search(dto: SearchDto): Promise<SearchResponse> {
        const limit = dto.limit || 10;
        const startTime = Date.now();

        try {
            let results: SearchResponse;

            if (dto.provider === SearchProvider.ALL_SOURCES) {
                results = await this.searchAllSources(dto.q, limit);
            } else {
                switch (dto.provider) {
                    case SearchProvider.SEMANTIC_SCHOLAR:
                        results = await this.searchSemanticScholar(dto.q, limit);
                        break;
                    case SearchProvider.ARXIV:
                        results = await this.searchArxiv(dto.q, limit);
                        break;
                    case SearchProvider.PUBMED:
                        results = await this.searchPubmed(dto.q, limit);
                        break;
                    case SearchProvider.CROSSREF:
                        results = await this.searchCrossRef(dto.q, limit);
                        break;
                    case SearchProvider.WEB_SEARCH:
                        results = await this.searchWeb(dto.q, limit);
                        break;
                    default:
                        results = await this.searchSemanticScholar(dto.q, limit);
                }
            }

            const searchTime = Date.now() - startTime;
            return {
                ...results,
                searchTime,
                sources: results.sources || [dto.provider || 'semantic_scholar']
            };

        } catch (error) {
            this.logger.error(`Error in search: ${error.message}`);
            return this.getMockSearchResults(dto.q, limit);
        }
    }

    // Поиск по всем источникам параллельно
    private async searchAllSources(query: string, limit: number): Promise<SearchResponse> {
        const limitPerSource = Math.ceil(limit / 4); // Распределяем лимит между источниками

        try {
            const [semanticResults, arxivResults, pubmedResults, crossrefResults] = await Promise.allSettled([
                this.searchSemanticScholar(query, limitPerSource),
                this.searchArxiv(query, limitPerSource),
                this.searchPubmed(query, limitPerSource),
                this.searchCrossRef(query, limitPerSource),
                this.searchWeb(query, limitPerSource)
            ]);

            const allItems: SearchResultItem[] = [];
            const sources: string[] = [];

            // Обработка результатов от всех источников
            if (semanticResults.status === 'fulfilled') {
                allItems.push(...semanticResults.value.items);
                sources.push('semantic_scholar');
            }

            if (arxivResults.status === 'fulfilled') {
                allItems.push(...arxivResults.value.items);
                sources.push('arxiv');
            }

            if (pubmedResults.status === 'fulfilled') {
                allItems.push(...pubmedResults.value.items);
                sources.push('pubmed');
            }

            if (crossrefResults.status === 'fulfilled') {
                allItems.push(...crossrefResults.value.items);
                sources.push('crossref');
            }

            // Удаляем дубликаты и сортируем
            const uniqueItems = this.removeDuplicates(allItems);
            const sortedItems = this.sortByRelevance(uniqueItems, query);

            return {
                items: sortedItems.slice(0, limit),
                totalFound: uniqueItems.length,
                sources
            };

        } catch (error) {
            this.logger.error(`Error in searchAllSources: ${error.message}`);
            return this.getMockSearchResults(query, limit);
        }
    }

    private async searchSemanticScholar(query: string, limit: number): Promise<SearchResponse> {
        try {
            const url = 'https://api.semanticscholar.org/graph/v1/paper/search';
            const params = {
                query,
                limit,
                fields: 'title,abstract,authors,url,year,externalIds,citationCount,referenceCount,fieldsOfStudy'
            };

            const response = await axios.get(url, {
                params,
                timeout: 10000,
                headers: {
                    'User-Agent': 'AI Research Assistant (academic research tool)'
                }
            });

            const papers = response.data.data || [];

            const items: SearchResultItem[] = await Promise.all(
                papers.map(async (paper: any) => {
                    await this.cacheSearchResult(paper, SearchProvider.SEMANTIC_SCHOLAR);

                    return {
                        id: paper.paperId,
                        source: SearchProvider.SEMANTIC_SCHOLAR,
                        title: paper.title,
                        authors: paper.authors ? paper.authors.map((author: any) => author.name) : [],
                        abstract: paper.abstract,
                        url: paper.url,
                        year: paper.year,
                    };
                })
            );

            return { items };
        } catch (error) {
            this.logger.error(`Error searching Semantic Scholar: ${error.message}`);
            if (error.response?.status === 429) {
                this.logger.warn('Rate limit exceeded for Semantic Scholar. Using mock data.');
            }
            return this.getMockSearchResults(query, limit);
        }
    }

    private async searchArxiv(query: string, limit: number): Promise<SearchResponse> {
        try {
            const url = 'http://export.arxiv.org/api/query';
            const params = {
                search_query: `all:${query}`,
                start: 0,
                max_results: limit,
                sortBy: 'relevance'
            };

            const response = await axios.get(url, {
                params,
                timeout: 10000,
                headers: {
                    'User-Agent': 'AI Research Assistant (academic research tool)'
                }
            });

            const xmlData = response.data;
            const items: SearchResultItem[] = [];

            // Простой парсинг XML
            const entries = xmlData.match(/<entry>(.*?)<\/entry>/gs) || [];

            for (const entry of entries.slice(0, limit)) {
                const titleMatch = entry.match(/<title>(.*?)<\/title>/s);
                const summaryMatch = entry.match(/<summary>(.*?)<\/summary>/s);
                const authorsMatches = entry.match(/<name>(.*?)<\/name>/gs);
                const publishedMatch = entry.match(/<published>(.*?)<\/published>/s);
                const idMatch = entry.match(/<id>(.*?)<\/id>/s);

                if (titleMatch && idMatch) {
                    const arxivId = idMatch[1].split('/').pop();

                    const item = {
                        id: arxivId || '',
                        source: SearchProvider.ARXIV,
                        title: titleMatch[1].replace(/\n/g, ' ').trim(),
                        authors: authorsMatches ? authorsMatches.map(m => m.replace(/<name>(.*?)<\/name>/g, '$1')) : [],
                        abstract: summaryMatch ? summaryMatch[1].replace(/\n/g, ' ').trim() : undefined,
                        url: idMatch[1],
                        year: publishedMatch ? new Date(publishedMatch[1]).getFullYear() : undefined,
                    };

                    items.push(item);
                    await this.cacheSearchResult(item, SearchProvider.ARXIV);
                }
            }

            return { items };
        } catch (error) {
            this.logger.error(`Error searching arXiv: ${error.message}`);
            return { items: [] };
        }
    }

    private async searchPubmed(query: string, limit: number): Promise<SearchResponse> {
        try {
            // PubMed eUtils API
            const searchUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
            const searchParams = {
                db: 'pubmed',
                term: query,
                retmax: limit,
                retmode: 'json'
            };

            const searchResponse = await axios.get(searchUrl, {
                params: searchParams,
                timeout: 10000,
                headers: {
                    'User-Agent': 'AI Research Assistant (academic research tool)'
                }
            });
            const ids = searchResponse.data.esearchresult?.idlist || [];

            if (ids.length === 0) {
                return { items: [] };
            }

            // Получаем детали статей
            const summaryUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
            const summaryParams = {
                db: 'pubmed',
                id: ids.join(','),
                retmode: 'json'
            };

            const summaryResponse = await axios.get(summaryUrl, {
                params: summaryParams,
                timeout: 10000
            });
            const articles = summaryResponse.data.result;

            const items: SearchResultItem[] = [];

            for (const id of ids) {
                const article = articles[id];
                if (article) {
                    const item = {
                        id: `pubmed:${id}`,
                        source: SearchProvider.PUBMED,
                        title: article.title || '',
                        authors: article.authors ? article.authors.map((a: any) => a.name) : [],
                        abstract: article.abstract,
                        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                        year: article.pubdate ? new Date(article.pubdate).getFullYear() : undefined,
                    };

                    items.push(item);
                    await this.cacheSearchResult(item, SearchProvider.PUBMED);
                }
            }

            return { items };
        } catch (error) {
            this.logger.error(`Error searching PubMed: ${error.message}`);
            return { items: [] };
        }
    }

    private async searchCrossRef(query: string, limit: number): Promise<SearchResponse> {
        try {
            const url = 'https://api.crossref.org/works';
            const params = {
                query: query,
                rows: limit,
                sort: 'relevance',
                order: 'desc'
            };

            const response = await axios.get(url, {
                params,
                timeout: 10000,
                headers: {
                    'User-Agent': 'AI Research Assistant (academic research tool)'
                }
            });
            const works = response.data.message?.items || [];

            const items: SearchResultItem[] = [];

            for (const work of works) {
                const item = {
                    id: work.DOI || work.URL,
                    source: SearchProvider.CROSSREF,
                    title: work.title ? work.title[0] : '',
                    authors: work.author ? work.author.map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()) : [],
                    abstract: work.abstract,
                    url: work.URL,
                    year: work.published ? work.published['date-parts'][0][0] : undefined,
                };

                items.push(item);
                await this.cacheSearchResult(item, SearchProvider.CROSSREF);
            }

            return { items };
        } catch (error) {
            this.logger.error(`Error searching CrossRef: ${error.message}`);
            return { items: [] };
        }
    }

    private async searchWeb(query: string, limit: number): Promise<SearchResponse> {
        // Пока заглушка - в будущем добавим Bing Search API
        this.logger.warn('Web search not implemented yet');
        return { items: [] };
    }

    // Утилиты для обработки результатов
    private removeDuplicates(items: SearchResultItem[]): SearchResultItem[] {
        const seen = new Set<string>();
        return items.filter(item => {
            const key = item.title.toLowerCase().trim();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    private sortByRelevance(items: SearchResultItem[], query: string): SearchResultItem[] {
        const queryWords = query.toLowerCase().split(/\s+/);

        return items.sort((a, b) => {
            let scoreA = 0;
            let scoreB = 0;

            // Подсчет релевантности по вхождению слов запроса
            for (const word of queryWords) {
                if (a.title.toLowerCase().includes(word)) scoreA += 2;
                if (a.abstract?.toLowerCase().includes(word)) scoreA += 1;

                if (b.title.toLowerCase().includes(word)) scoreB += 2;
                if (b.abstract?.toLowerCase().includes(word)) scoreB += 1;
            }

            // Учитываем год публикации (свежие статьи выше)
            if (a.year && b.year) {
                scoreA += (a.year - 2020) * 0.1;
                scoreB += (b.year - 2020) * 0.1;
            }

            return scoreB - scoreA;
        });
    }

    private async cacheSearchResult(paper: any, source: SearchProvider): Promise<void> {
        try {
            const externalId = paper.paperId || paper.id || paper.DOI;

            await this.prisma.paperCache.upsert({
                where: { externalId },
                update: {
                    title: paper.title,
                    authors: JSON.stringify(paper.authors?.map((a: any) => a.name || a) || []),
                    abstract: paper.abstract,
                    url: paper.url,
                    year: paper.year,
                    rawJson: paper,
                },
                create: {
                    externalId,
                    source,
                    title: paper.title,
                    authors: JSON.stringify(paper.authors?.map((a: any) => a.name || a) || []),
                    abstract: paper.abstract,
                    url: paper.url,
                    year: paper.year,
                    rawJson: paper,
                },
            });
        } catch (error) {
            this.logger.error(`Error caching search result: ${error.message}`);
        }
    }

    private getMockSearchResults(query: string, limit: number): SearchResponse {
        const mockPapers: SearchResultItem[] = [
            {
                id: 'mock-1',
                source: SearchProvider.SEMANTIC_SCHOLAR,
                title: `Comprehensive Survey of ${query} Applications`,
                authors: ['Alice Johnson', 'Bob Smith'],
                abstract: `This comprehensive survey explores the current state of ${query} research, examining key methodologies, challenges, and future directions. We analyze over 100 recent publications to provide insights into emerging trends and opportunities in this rapidly evolving field.`,
                url: 'https://example.com/paper1',
                year: 2023,
            },
            {
                id: 'mock-2',
                source: SearchProvider.SEMANTIC_SCHOLAR,
                title: `Deep Learning Approaches to ${query}`,
                authors: ['Carol Davis', 'David Wilson'],
                abstract: `Recent advances in deep learning have shown promising results in ${query}. This review covers the latest developments, challenges, and opportunities in applying neural networks to this domain.`,
                url: 'https://example.com/paper2',
                year: 2024,
            },
            {
                id: 'mock-3',
                source: SearchProvider.SEMANTIC_SCHOLAR,
                title: `Statistical Analysis of ${query} Patterns`,
                authors: ['Charlie Brown', 'Diana Prince'],
                abstract: `We present a statistical framework for analyzing patterns in ${query}. Our methodology combines classical statistical approaches with modern computational techniques to provide robust analysis tools.`,
                url: 'https://example.com/paper3',
                year: 2022,
            }
        ];

        return {
            items: mockPapers.slice(0, Math.min(limit, mockPapers.length))
        };
    }
}


