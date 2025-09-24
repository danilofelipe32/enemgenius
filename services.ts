
import { Question, Exam, KnowledgeFile, KnowledgeFileWithContent, ApiFreeLLMResponse } from './types';

// --- API Service ---
// A service to interact with ApiFreeLLM, a free, rate-limited LLM API.
// It handles the specific response structure including success, error, and rate-limiting with retries.

// NOTA: Um proxy CORS é usado para contornar as restrições de segurança do navegador.
// O erro "Failed to fetch" ocorre porque a API de destino (api.api-free.workers.dev)
// não envia os cabeçalhos CORS necessários (ex: Access-Control-Allow-Origin).
// O proxy adiciona esses cabeçalhos, permitindo que o navegador processe a resposta.
// Esta é uma solução comum para aplicações do lado do cliente que consomem APIs de terceiros.
const API_FREE_LLM_ENDPOINT = 'https://corsproxy.io/?https://api.api-free.workers.dev/';

export const apiService = {
  async generate(prompt: string, schema?: any): Promise<string> {
    // O parâmetro 'schema' é ignorado, pois esta API gratuita genérica não suporta esquemas de saída estruturados.
    // A assinatura é mantida para compatibilidade com as chamadas existentes no aplicativo.

    const makeRequest = async (): Promise<string> => {
      try {
        // Em um aplicativo real, chamar uma API de terceiros do cliente pode ser inseguro.
        // Esta implementação é para fins de demonstração.
        const response = await fetch(API_FREE_LLM_ENDPOINT, {
          method: 'POST',
          mode: 'cors', // Define explicitamente o modo CORS para requisições entre origens
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json', // Informa o tipo de conteúdo esperado na resposta
          },
          body: JSON.stringify({ message: prompt }), // Usa o campo 'message' conforme a documentação da ApiFreeLLM
        });

        if (!response.ok) {
          // Isso lida com erros de rede, não com erros da API que são retornados com HTTP 200.
          throw new Error(`Erro de rede: ${response.status} ${response.statusText}`);
        }

        const data: ApiFreeLLMResponse = await response.json();

        switch (data.status) {
          case 'success':
            if (!data.response || data.response.trim() === '') {
                throw new Error("A API retornou uma resposta vazia, mas com status de sucesso.");
            }
            return data.response;
          
          case 'rate_limited':
            const retryAfter = data.retry_after || 5; // Padrão de 5 segundos se não especificado
            console.warn(`Limite de taxa da API atingido. Tentando novamente em ${retryAfter} segundos...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return makeRequest(); // Tenta a requisição novamente

          case 'error':
            throw new Error(`Erro retornado pela API: ${data.error || 'Ocorreu um erro desconhecido.'}`);

          default:
            throw new Error('Formato de resposta da API inesperado.');
        }
      } catch (error) {
        // Este bloco catch lida com erros de rede, falhas na análise do JSON ou erros lançados acima.
        console.error("Falha na requisição à API:", error);
        const originalErrorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        
        // Verifica erros comuns do lado do cliente para fornecer feedback mais útil.
        if (originalErrorMessage.includes('Failed to fetch')) {
            throw new Error("Erro de rede ao tentar se comunicar com a API. Verifique sua conexão com a internet ou se há algum bloqueio de CORS no servidor de destino.");
        }
        
        throw new Error(`Falha ao se comunicar com o serviço de IA: ${originalErrorMessage}.`);
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