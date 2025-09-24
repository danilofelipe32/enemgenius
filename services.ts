import { Question, Exam, KnowledgeFile, KnowledgeFileWithContent } from './types';

// --- API Service ---
// Serviço para interagir com a APIFreeLLM.
// Esta abordagem oferece uso ilimitado e gratuito para prototipagem e desenvolvimento.

// URL da API
const API_URL = "https://apifreellm.com/api/chat";

export const apiService = {
  async generate(prompt: string): Promise<string> {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: prompt,
        }),
      });

      // APIFreeLLM sempre retorna 200, então precisamos verificar o corpo da resposta.
      if (!response.ok) {
          // Isso lida com erros de rede, não com erros da API em si.
          throw new Error(`Erro de rede: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      switch (data.status) {
        case 'success':
          if (!data.response || data.response.trim() === '') {
            throw new Error("A API retornou uma resposta vazia, mas com status de sucesso.");
          }
          return data.response;
        case 'rate_limited':
          throw new Error(`Limite de requisições excedido. Por favor, aguarde ${data.retry_after} segundos.`);
        case 'error':
          // O campo 'error' contém a mensagem de erro da API.
          throw new Error(data.error || 'Ocorreu um erro desconhecido na API.');
        default:
          throw new Error(`Status de resposta da API desconhecido: ${data.status}`);
      }

    } catch (error) {
      // Captura erros da API ou de rede.
      console.error("Falha na requisição à APIFreeLLM:", error);
      const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
      
      // Re-lança o erro para que a UI possa capturá-lo e exibi-lo.
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
   * Divide um texto longo em partes menores e semanticamente coerentes.
   * Prioriza a divisão por parágrafos e, em seguida, por frases para evitar a quebra de ideias.
   * @param text O texto completo a ser dividido.
   * @param maxChunkSize O tamanho máximo alvo para cada parte (em caracteres).
   * @returns Um array de partes de texto.
   */
  chunkText(text: string, maxChunkSize: number = 1800): string[] {
    const chunks: string[] = [];

    if (!text || text.trim().length === 0) {
      return [];
    }

    // 1. Divide por novas linhas duplas (parágrafos). Esta é a principal fronteira semântica.
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    let currentChunk = "";

    for (const paragraph of paragraphs) {
      // Se um único parágrafo for maior que o nosso tamanho máximo, ele precisa ser dividido.
      if (paragraph.length > maxChunkSize) {
        // Primeiro, se tivermos um `currentChunk`, vamos salvá-lo.
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
        
        // Divide o parágrafo grande em frases.
        // Esta regex é projetada para manter o delimitador (. ! ?) com a frase.
        const sentences = paragraph.match(/[^.!?]+(?:[.!?]|\s|$)/g) || [];
        let sentenceChunk = "";
        for (const sentence of sentences) {
          const trimmedSentence = sentence.trim();
          if (trimmedSentence.length === 0) continue;

          // Se adicionar a próxima frase exceder o tamanho máximo, salva a parte de frase atual.
          if ((sentenceChunk + " " + trimmedSentence).length > maxChunkSize) {
            chunks.push(sentenceChunk.trim());
            sentenceChunk = trimmedSentence;
          } else {
            sentenceChunk += (sentenceChunk.length > 0 ? " " : "") + trimmedSentence;
          }
        }
        // Salva a última parte de frase restante do parágrafo grande.
        if (sentenceChunk.length > 0) {
          chunks.push(sentenceChunk.trim());
        }
      } else {
        // Se adicionar o próximo parágrafo exceder o tamanho máximo, salva a parte atual e começa uma nova.
        if ((currentChunk + "\n\n" + paragraph).length > maxChunkSize) {
          chunks.push(currentChunk.trim());
          currentChunk = paragraph;
        } else {
          // Caso contrário, anexa o parágrafo à parte atual.
          currentChunk += (currentChunk.length > 0 ? "\n\n" : "") + paragraph;
        }
      }
    }

    // Não se esqueça da última parte.
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
    }
    
    // Se, por algum motivo, não tivermos partes, mas havia texto, retorna o texto inteiro como uma única parte.
    if (chunks.length === 0 && text.length > 0) {
      return [text];
    }

    return chunks;
  }
};
