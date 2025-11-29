// analyze-paper.dto.ts
export interface AnalyzePaperDto {
  id: string;           // ID статьи
  source: string;       // Источник (arXiv, PubMed, etc.)
  title: string;        // Название статьи
  authors: string[];    // Авторы
  abstract?: string;    // Аннотация
  url?: string;         // Ссылка
  year?: number;        // Год публикации
  summary?: string;     // Опционально: уже сгенерированное резюме
  keyWords?: string[];  // Опционально: ключевые слова
}
