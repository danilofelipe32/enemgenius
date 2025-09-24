export interface Question {
  id: string;
  stem: string;
  type: 'objective' | 'subjective';
  options?: string[];
  answerIndex?: number;
  expectedAnswer?: string;
  favorited: boolean;
  discipline: string;
  bloomLevel: string;
  constructionType: string;
  difficulty: string;
  schoolYear: string;
  topics: string[];
  creationDate: number;
}

export interface Exam {
  id: string;
  name: string;
  questionIds: string[];
  creationDate: number;
  generationOptions?: {
    includeOptions: boolean;
    includeAnswerKey: boolean;
  };
}

export interface KnowledgeFile {
  id: string;
  name: string;
  isSelected: boolean;
}

export interface KnowledgeFileWithContent extends KnowledgeFile {
    indexedChunks: { text: string; tfIndex: Record<string, number> }[];
}