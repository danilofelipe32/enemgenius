
import { Question, Exam, KnowledgeFile, KnowledgeFileWithContent } from './types';
import { GoogleGenAI } from '@google/genai';

// --- API Service ---
// Serviço para interagir com a API do Google Gemini.

// A chave de API é obtida a partir das variáveis de ambiente.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const apiService = {
  async generate(prompt: string, options: { jsonOutput?: boolean; systemInstruction?: string; temperature?: number } = {}): Promise<string> {
    try {
        const { jsonOutput, systemInstruction, temperature } = options;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                ...(systemInstruction && { systemInstruction }),
                ...(jsonOutput && { responseMimeType: 'application/json' }),
                ...(temperature !== undefined && { temperature })
            }
        });
        
        return response.text;

    } catch (error) {
      console.error("Falha na requisição à API Gemini:", error);
      // Fornece feedback mais detalhado sobre o erro, se disponível.
      const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
      throw new Error(`Falha ao se comunicar com o serviço de IA: ${errorMessage}`);
    }
  }
};


// --- Storage Service ---
const DB_NAME = "EnemGeniusPWA_DB";
const KNOWLEDGE_STORE = "knowledgeFiles";
let db: IDBDatabase;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject("Erro ao abrir o IndexedDB");
    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const dbInstance = (event.target as IDBOpenDBRequest).result;
      if (!dbInstance.objectStoreNames.contains(KNOWLEDGE_STORE)) {
        dbInstance.createObjectStore(KNOWLEDGE_STORE, { keyPath: 'id' });
      }
    };
  });
};

export const storageService = {
  async init() {
    if (!db) {
      db = await openDB();
    }
  },

  // LocalStorage for simple data
  getQuestions(): Question[] {
    const data = localStorage.getItem('enem_genius_questions');
    return data ? JSON.parse(data) : [];
  },
  saveQuestions(questions: Question[]) {
    localStorage.setItem('enem_genius_questions', JSON.stringify(questions));
  },
  getExams(): Exam[] {
    const data = localStorage.getItem('enem_genius_exams');
    return data ? JSON.parse(data) : [];
  },
  saveExams(exams: Exam[]) {
    localStorage.setItem('enem_genius_exams', JSON.stringify(exams));
  },

  // IndexedDB for knowledge files
  async saveFile(file: KnowledgeFileWithContent): Promise<void> {
    const transaction = db.transaction([KNOWLEDGE_STORE], "readwrite");
    const store = transaction.objectStore(KNOWLEDGE_STORE);
    store.put(file);
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
  },
  async getFile(id: string): Promise<KnowledgeFileWithContent | undefined> {
    const transaction = db.transaction([KNOWLEDGE_STORE], "readonly");
    const store = transaction.objectStore(KNOWLEDGE_STORE);
    const request = store.get(id);
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
  },
  async getAllFilesMeta(): Promise<KnowledgeFile[]> {
    const transaction = db.transaction([KNOWLEDGE_STORE], "readonly");
    const store = transaction.objectStore(KNOWLEDGE_STORE);
    const request = store.getAll();
    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            const files = request.result as KnowledgeFileWithContent[];
            resolve(files.map(({ id, name, isSelected }) => ({ id, name, isSelected })));
        };
        request.onerror = () => reject(request.error);
    });
  },
  async deleteFile(id: string): Promise<void> {
     const transaction = db.transaction([KNOWLEDGE_STORE], "readwrite");
     const store = transaction.objectStore(KNOWLEDGE_STORE);
     store.delete(id);
     return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
  },
};

// --- File Parser Service ---
declare const mammoth: any;
declare const pdfjsLib: any;

export const fileParserService = {
  async parseFile(file: File): Promise<string> {
    if (file.type === 'application/pdf') {
      return this.parsePdf(file);
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return this.parseDocx(file);
    } else if (file.type === 'text/plain' || file.type === 'text/markdown') {
      return file.text();
    }
    throw new Error(`Tipo de arquivo não suportado: ${file.type}`);
  },

  async parsePdf(file: File): Promise<string> {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error("A biblioteca pdf.js não está carregada. Por favor, inclua-a no index.html.");
    }
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        throw new Error("O 'workerSrc' do PDF.js não foi configurado. Verifique o script no index.html.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n\n';
    }
    return fullText;
  },

  async parseDocx(file: File): Promise<string> {
    if (typeof mammoth === 'undefined') {
      throw new Error("A biblioteca mammoth.js não está carregada. Por favor, inclua-a no index.html.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
};

// --- RAG Service ---
// Fornece uma divisão de texto inteligente para a Geração Aumentada por Recuperação (RAG).
export const ragService = {
  /**
   * Identifica se uma linha de texto é o início de um item de lista.
   * Suporta marcadores (*, +, -) e numeração (1., a)).
   * @param line A linha a ser verificada.
   * @returns `true` se a linha for um item de lista, caso contrário `false`.
   */
  _isListItem(line: string): boolean {
    // Regex: corresponde a espaços em branco opcionais no início, seguidos por
    // um asterisco, mais, ou hífen, OU dígitos seguidos por um ponto, OU uma letra seguida por um parêntese,
    // e depois pelo menos um espaço em branco.
    return /^\s*([*+-]|\d+\.|\w\))\s+/.test(line);
  },

  /**
   * Divide um texto em blocos semanticamente coerentes.
   * Agrupa parágrafos de texto contínuo e listas inteiras como blocos separados.
   * @param text O texto a ser dividido em blocos.
   * @returns Um array de blocos de texto (parágrafos ou listas).
   */
  _getSemanticBlocks(text: string): string[] {
    const blocks: string[] = [];
    const lines = text.split('\n');
    let currentBlockLines: string[] = [];
    let blockType: 'text' | 'list' | 'unknown' = 'unknown';

    const flushBlock = () => {
        if (currentBlockLines.length > 0) {
            blocks.push(currentBlockLines.join('\n').trim());
            currentBlockLines = [];
            blockType = 'unknown';
        }
    };

    for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine === "") { // Linha em branco sempre age como um separador
            flushBlock();
            continue;
        }

        const isCurrentLineListItem = this._isListItem(line);
        const currentLineType = isCurrentLineListItem ? 'list' : 'text';

        if (blockType === 'unknown') {
            blockType = currentLineType;
        }
        
        // Se o tipo de linha mudar (de texto para lista ou vice-versa), finaliza o bloco atual.
        if (blockType !== currentLineType) {
            flushBlock();
            blockType = currentLineType;
        }

        currentBlockLines.push(line);
    }

    flushBlock(); // Garante que o último bloco seja adicionado

    return blocks.filter(b => b.length > 0);
  },

  /**
   * Divide um texto longo em partes menores e semanticamente coerentes.
   * Respeita parágrafos, listas e frases para criar chunks mais relevantes.
   * @param text O texto completo a ser dividido.
   * @param maxChunkSize O tamanho máximo alvo para cada parte (em caracteres).
   * @returns Um array de partes de texto.
   */
  chunkText(text: string, maxChunkSize: number = 1800): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }
    
    const chunks: string[] = [];
    const semanticBlocks = this._getSemanticBlocks(text);
    let currentChunk = "";

    for (const block of semanticBlocks) {
      // Se um único bloco for maior que o nosso tamanho máximo, ele precisa ser dividido de forma inteligente.
      if (block.length > maxChunkSize) {
        // Se tivermos um `currentChunk`, vamos salvá-lo para dar espaço ao bloco grande.
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = "";
        }
        
        // Verifica se o bloco é uma lista (baseado no seu primeiro item)
        const isList = this._isListItem(block.split('\n')[0]);
        
        let subItems: string[];
        if (isList) {
          // Para listas, divida entre os itens da lista, preservando itens de várias linhas.
          const lines = block.split('\n');
          const items: string[] = [];
          let currentItem = "";
          for(const line of lines) {
              if (this._isListItem(line) && currentItem) {
                  items.push(currentItem.trim());
                  currentItem = line;
              } else {
                  currentItem += (currentItem ? '\n' : '') + line;
              }
          }
          if (currentItem) items.push(currentItem.trim());
          subItems = items;

        } else {
          // Para parágrafos, divida em frases.
          subItems = block.match(/[^.!?]+(?:[.!?]|\s|$)/g) || [block];
        }

        let subChunk = "";
        for (const item of subItems) {
          const trimmedItem = item.trim();
          if (trimmedItem.length === 0) continue;
          
          // Se o próprio subitem for muito grande, adicione-o como está.
          if(trimmedItem.length > maxChunkSize) {
              if(subChunk.length > 0) chunks.push(subChunk);
              subChunk = "";
              chunks.push(trimmedItem);
              continue;
          }

          // Se adicionar o próximo subitem exceder o tamanho, salva o sub-chunk atual.
          if ((subChunk + "\n" + trimmedItem).length > maxChunkSize) {
            if(subChunk.length > 0) chunks.push(subChunk);
            subChunk = trimmedItem;
          } else {
            subChunk += (subChunk.length > 0 ? "\n" : "") + trimmedItem;
          }
        }
        // Salva o último sub-chunk restante do bloco grande.
        if (subChunk.length > 0) {
          chunks.push(subChunk);
        }

      } else {
        // Se adicionar o próximo bloco exceder o tamanho, salva o chunk atual e começa um novo.
        if ((currentChunk + "\n\n" + block).length > maxChunkSize) {
          if (currentChunk.length > 0) chunks.push(currentChunk);
          currentChunk = block;
        } else {
          // Caso contrário, anexa o bloco ao chunk atual.
          currentChunk += (currentChunk.length > 0 ? "\n\n" : "") + block;
        }
      }
    }

    // Não se esqueça do último chunk.
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    // Se, por algum motivo, não tivermos chunks, mas havia texto, retorna o texto inteiro como um único chunk.
    if (chunks.length === 0 && text.length > 0) {
      return [text];
    }

    // Limpa a saída, removendo espaços desnecessários e chunks vazios.
    return chunks.map(c => c.trim()).filter(c => c.length > 0);
  }
};
