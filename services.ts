
import { Question, Exam, KnowledgeFile, KnowledgeFileWithContent, ApiFreeLLMResponse } from './types';

// --- API Service ---
const API_URL = 'https://apifreellm.com/api/chat';

export const apiService = {
  async generate(prompt: string): Promise<string> {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt })
    });

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.statusText} (${response.status})`);
    }

    const data: ApiFreeLLMResponse = await response.json();

    if (data.status === 'success') {
      if (!data.response || data.response.trim() === '') {
        throw new Error("A API retornou uma resposta vazia. Por favor, tente novamente.");
      }
      return data.response;
    } else {
      const errorMessage = data.error || 'Ocorreu um erro desconhecido na API.';
      if (data.status === 'rate_limited') {
        throw new Error(`Limite de requisições excedido. Por favor, aguarde ${data.retry_after || 5} segundos.`);
      }
      throw new Error(errorMessage);
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