
import { Question, Exam, KnowledgeFile, KnowledgeFileWithContent, ApiFreeLLMResponse } from './types';

// --- API Service ---
// A service to interact with ApiFreeLLM, a free, rate-limited LLM API.
// It handles the specific response structure including success, error, and rate-limiting with retries.
const API_FREE_LLM_ENDPOINT = 'https://api.api-free.workers.dev/';

export const apiService = {
  async generate(prompt: string, schema?: any): Promise<string> {
    // The 'schema' parameter is ignored as this generic free API is not expected to support structured output schemas.
    // The signature is kept for compatibility with existing calls in the app.

    const makeRequest = async (): Promise<string> => {
      try {
        // In a real app, calling a third-party API from the client can be insecure.
        // This implementation is for demonstration purposes.
        const response = await fetch(API_FREE_LLM_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: prompt }), // Use 'message' field as per ApiFreeLLM docs
        });

        if (!response.ok) {
          // This handles network-level errors, not API errors which are returned with HTTP 200.
          throw new Error(`Erro de rede: ${response.status} ${response.statusText}`);
        }

        const data: ApiFreeLLMResponse = await response.json();

        switch (data.status) {
          case 'success':
            if (!data.response || data.response.trim() === '') {
                throw new Error("A API retornou uma resposta vazia.");
            }
            return data.response;
          
          case 'rate_limited':
            const retryAfter = data.retry_after || 5; // Default to 5 seconds
            console.warn(`Rate limited by API. Retrying in ${retryAfter} seconds...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return makeRequest(); // Retry the request

          case 'error':
            throw new Error(`Erro retornado pela API: ${data.error || 'Ocorreu um erro desconhecido.'}`);

          default:
            throw new Error('Formato de resposta da API inesperado.');
        }
      } catch (error) {
        // This catch block handles network errors or if the endpoint is not reachable.
        console.error("API request failed:", error);
        throw new Error("Falha ao se comunicar com o serviço de IA. Verifique sua conexão de rede e se o serviço está online.");
      }
    };

    return makeRequest();
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
