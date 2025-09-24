import { Question, Exam, KnowledgeFile, KnowledgeFileWithContent } from './types';
import { GoogleGenAI } from "@google/genai";

// --- API Service ---
// Serviço para interagir com a API oficial do Google Gemini.
// Esta abordagem substitui a ApiFreeLLM para garantir estabilidade, performance
// e eliminar a necessidade de proxies CORS.

// Inicializa o cliente Gemini. A chave de API deve estar disponível
// como uma variável de ambiente (process.env.API_KEY).
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const apiService = {
  async generate(prompt: string): Promise<string> {
    try {
      // Verifica se o prompt está solicitando uma saída JSON para configurar a API adequadamente.
      const isJsonPrompt = prompt.includes("Sua resposta DEVE ser um array JSON válido");

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          // Usa o modo JSON nativo do Gemini quando aplicável para maior confiabilidade
          ...(isJsonPrompt && { responseMimeType: "application/json" }),
        },
      });

      const text = response.text;

      if (!text || text.trim() === '') {
        throw new Error("A API retornou uma resposta vazia, mas com status de sucesso.");
      }
      return text;

    } catch (error) {
      // Captura erros da API Gemini ou de rede.
      console.error("Falha na requisição à API Gemini:", error);
      const originalErrorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
      
      if (originalErrorMessage.includes('API key not valid')) {
         throw new Error("A chave de API para o serviço de IA não é válida. Verifique a configuração.");
      }
      if (originalErrorMessage.toLowerCase().includes('fetch')) {
          throw new Error("Erro de rede ao se comunicar com a API. Verifique sua conexão com a internet.");
      }
      
      throw new Error(`Falha ao se comunicar com o serviço de IA: ${originalErrorMessage}.`);
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
      fullText += textContent.items.map((item: any) => item.str).join(' ');
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