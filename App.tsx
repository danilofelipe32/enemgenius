

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { HashRouter, Routes, Route, NavLink, useLocation, Navigate, useParams, Link, useNavigate } from 'react-router-dom';
import { Question, Exam, KnowledgeFile, KnowledgeFileWithContent } from './types';
import { storageService, apiService, fileParserService, ragService } from './services';
import { ALL_DISCIPLINES, DISCIPLINE_TO_AREA_MAP, KNOWLEDGE_AREAS } from './constants';

// --- Global Declarations ---
declare const jspdf: any;

// --- Helper Functions ---
const formatDate = (timestamp: number): string => {
  if (!timestamp) return 'Data desconhecida';
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};


// --- RAG Helper Functions ---

const PORTUGUESE_STOP_WORDS = new Set([
  'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não', 'uma',
  'os', 'no', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'foi', 'ao', 'ele',
  'das', 'tem', 'à', 'seu', 'sua', 'ou', 'ser', 'quando', 'muito', 'há', 'nos', 'já',
  'está', 'eu', 'também', 'só', 'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'era',
  'depois', 'sem', 'mesmo', 'aos', 'ter', 'seus', 'quem', 'nas', 'me', 'esse', 'eles',
  'estão', 'você', 'tinha', 'foram', 'essa', 'num', 'nem', 'suas', 'meu', 'às', 'minha',
  'têm', 'numa', 'pelos', 'elas', 'havia', 'seja', 'qual', 'será', 'nós', 'tenho',
  'lhe', 'deles', 'essas', 'esses', 'pelas', 'este', 'fosse', 'dele', 'tu', 'te',
  'vocês', 'vos', 'lhes', 'meus', 'minhas', 'teu', 'tua', 'teus', 'tuas', 'nosso',
  'nossa', 'nossos', 'nossas', 'dela', 'delas', 'esta', 'estes', 'estas', 'aquele',
  'aquela', 'aqueles', 'aquelas', 'isto', 'aquilo', 'estou', 'está', 'estamos', 'estão',
  'estive', 'esteve', 'estivemos', 'estiveram', 'estava', 'estávamos', 'estavam',
  'estivera', 'estivéramos', 'esteja', 'estejamos', 'estejam', 'estivesse', 'estivéssemos',
  'estivessem', 'estiver', 'estivermos', 'estiverem', 'hei', 'há', 'havemos', 'hão',
  'houve', 'houvemos', 'houveram', 'houvera', 'houvéramos', 'haja', 'hajamos', 'hajam',
  'houvesse', 'houvéssemos', 'houvessem', 'houver', 'houvermos', 'houverem', 'houverei',
  'houverá', 'houveremos', 'houverão', 'houveria', 'houveríamos', 'houveriam', 'sou',
  'somos', 'são', 'era', 'éramos', 'eram', 'fui', 'foi', 'fomos', 'foram', 'fora',
  'fôramos', 'seja', 'sejamos', 'sejam', 'fosse', 'fôssemos', 'fossem', 'for', 'formos',
  'forem', 'serei', 'será', 'seremos', 'serão', 'seria', 'seríamos', 'seriam', 'tenho',
  'tem', 'temos', 'tém', 'tinha', 'tínhamos', 'tinham', 'tive', 'teve', 'tivemos',
  'tiveram', 'tivera', 'tivéramos', 'tenha', 'tenhamos', 'tenham', 'tivesse',
  'tivéssemos', 'tivessem', 'tiver', 'tivermos', 'tiverem', 'terei', 'terá',
  'teremos', 'terão', 'teria', 'teríamos', 'teriam'
]);

const tokenizeAndClean = (text: string): string[] => {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize("NFD") // Separate accents from letters
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/) // Split by whitespace
    .filter(word => word.length > 2 && !PORTUGUESE_STOP_WORDS.has(word));
};

const calculateTf = (text: string): Record<string, number> => {
  const terms = tokenizeAndClean(text);
  const termFrequencies: Record<string, number> = {};
  for (const term of terms) {
    termFrequencies[term] = (termFrequencies[term] || 0) + 1;
  }
  return termFrequencies;
};

// --- UI Components (defined in the same file for simplicity) ---

const Spinner: React.FC<{ size?: 'small' | 'large' }> = ({ size = 'large' }) => {
    const sizeClasses = size === 'large' ? 'w-10 h-10 border-4' : 'w-5 h-5 border-2';
    return <div className={`animate-spin rounded-full border-slate-200 border-t-cyan-600 ${sizeClasses}`}></div>;
};

const Notification: React.FC<{ message: string; type: 'success' | 'error'; onDismiss: () => void }> = ({ message, type, onDismiss }) => {
    const baseClasses = 'fixed top-5 right-5 z-[200] p-4 rounded-lg shadow-lg text-sm font-semibold transition-opacity duration-300';
    const typeClasses = type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';

    useEffect(() => {
        const timer = setTimeout(onDismiss, 5000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div className={`${baseClasses} ${typeClasses}`}>
            {message}
            <button onClick={onDismiss} className="ml-4 font-bold">×</button>
        </div>
    );
};

const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
    return (
        <div className="relative group">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 cursor-help" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-max max-w-xs bg-slate-800 text-white text-xs rounded py-1.5 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 shadow-lg">
                {text}
                <svg className="absolute text-slate-800 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255" xmlSpace="preserve">
                    <polygon className="fill-current" points="0,0 127.5,127.5 255,0" />
                </svg>
            </div>
        </div>
    );
};


// --- Custom Dropdown Component ---
interface CustomDropdownProps {
    id: string;
    label: string;
    options: string[];
    selectedValue: string;
    onSelect: (value: string) => void;
    tooltip?: string;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({ id, label, options, selectedValue, onSelect, tooltip }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleSelect = (option: string) => {
        onSelect(option);
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <div className="flex items-center gap-1.5">
                 <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
                 {tooltip && <InfoTooltip text={tooltip} />}
            </div>
            <button
                type="button"
                id={id}
                onClick={() => setIsOpen(!isOpen)}
                className="mt-1 flex w-full items-center justify-between rounded-md border border-slate-300 bg-white py-2 pl-3 pr-2 text-left shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 sm:text-sm"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <span className="block truncate">{selectedValue}</span>
                <span className="pointer-events-none">
                     <svg className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                </span>
            </button>
            {isOpen && (
                <ul
                    className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm"
                    tabIndex={-1}
                    role="listbox"
                    aria-labelledby={label}
                >
                    {options.map(option => (
                        <li
                            key={option}
                            onClick={() => handleSelect(option)}
                            className={`relative cursor-pointer select-none py-2 px-4 ${
                                selectedValue === option ? 'bg-slate-700 text-white' : 'text-slate-900 hover:bg-slate-100'
                            }`}
                            role="option"
                            aria-selected={selectedValue === option}
                        >
                           <span className={`block truncate ${selectedValue === option ? 'font-semibold' : 'font-normal'}`}>
                                {option}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// --- Temperature Slider Component ---
interface TemperatureSliderProps {
    id: string;
    label: string;
    value: number;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    min?: number;
    max?: number;
    step?: number;
    tooltip?: string;
}

const TemperatureSlider: React.FC<TemperatureSliderProps> = ({ id, label, value, onChange, min = 0, max = 1, step = 0.01, tooltip }) => {
    const percentage = ((value - min) / (max - min)) * 100;
    // Gradient: from cyan-200 to cyan-500, then slate-200
    const gradientStyle = {
        background: `linear-gradient(to right, #a5f3fc, #06b6d4 ${percentage}%, #e5e7eb ${percentage}%)`
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                    <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
                    {tooltip && <InfoTooltip text={tooltip} />}
                </div>
                <span className="text-sm font-semibold text-slate-600 w-12 text-right">{value.toFixed(2)}</span>
            </div>
            <input
                type="range"
                id={id}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={onChange}
                style={gradientStyle}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer range-slider"
            />
        </div>
    );
};


// --- Explanation Modal Component ---
interface ExplanationModalProps {
    isOpen: boolean;
    onClose: () => void;
    question: Question | null;
    explanation: string;
    isLoading: boolean;
    error: string | null;
}

const ExplanationModal: React.FC<ExplanationModalProps> = ({ isOpen, onClose, question, explanation, isLoading, error }) => {
    if (!isOpen || !question) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex items-center justify-center p-4 transition-opacity duration-300" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                    <h3 className="text-lg font-bold text-slate-800">Explicação da Questão</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>
                <main className="p-6 overflow-y-auto custom-scrollbar">
                    <div className="mb-4 p-3 bg-slate-50 rounded-md border border-slate-200">
                       <p className="text-slate-800 font-medium whitespace-pre-wrap">{question.stem}</p>
                       {question.type === 'objective' && question.options && typeof question.answerIndex === 'number' && (
                           <ol className="list-[upper-alpha] list-inside pl-2 mt-2 space-y-1 text-slate-600 text-sm">
                               {question.options.map((option, index) => <li key={index} className={question.answerIndex === index ? 'font-semibold text-cyan-800' : ''}>{option}</li>)}
                           </ol>
                       )}
                    </div>
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500">
                            <Spinner />
                            <p className="mt-4 font-semibold">Gerando explicação...</p>
                            <p className="text-sm">A IA está analisando a questão.</p>
                        </div>
                    )}
                    {error && (
                        <div className="text-red-700 bg-red-50 p-4 rounded-md border border-red-200">
                            <p className="font-bold mb-1">Erro ao Gerar Explicação</p>
                            <p className="text-sm">{error}</p>
                        </div>
                    )}
                    {!isLoading && !error && explanation && (
                        <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {explanation}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

// --- Info Modal Component ---
const InfoModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex items-center justify-center p-4 transition-opacity duration-300" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                    <h3 className="text-lg font-bold text-slate-800">Sobre o ENEM Genius PWA</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full" aria-label="Fechar">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>
                <main className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                    <p className="text-slate-600">
                        Um PWA (Progressive Web App) com inteligência artificial para gerar questões e provas de alta qualidade para o ENEM, com base na Taxonomia de Bloom.
                    </p>
                    <div>
                        <h4 className="font-semibold text-slate-800 mb-2">Funcionalidades Principais:</h4>
                        <ul className="list-disc list-inside space-y-1 text-slate-600">
                            <li><strong>Gerador de Questões:</strong> Crie questões objetivas e dissertativas personalizadas com parâmetros detalhados.</li>
                            <li><strong>Banco de Questões:</strong> Armazene, filtre, edite e gerencie todas as suas questões em um só lugar.</li>
                            <li><strong>Criador de Provas:</strong> Monte provas e avaliações selecionando questões do seu banco.</li>
                            <li><strong>Base de Conhecimento (RAG):</strong> Faça upload de documentos (.pdf, .docx, .txt) para gerar questões baseadas em um conteúdo específico.</li>
                        </ul>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600">
                        <p><strong>Tecnologia:</strong> Este projeto utiliza a API do Google Gemini para a geração de conteúdo por IA e IndexedDB/LocalStorage para armazenamento local no seu navegador, garantindo que seus dados permaneçam privados.</p>
                    </div>
                </main>
                <footer className="p-4 bg-slate-50 border-t border-slate-200 text-center flex-shrink-0">
                    <a 
                        href="https://wa.me/5584999780963" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-slate-500 hover:text-cyan-700 transition-colors"
                    >
                        Produzido por Danilo Arruda
                    </a>
                </footer>
            </div>
        </div>
    );
};

// --- Question Generator View ---

const BLOOM_LEVELS = ['Lembrar', 'Entender', 'Aplicar', 'Analisar', 'Avaliar', 'Criar'];
const CONSTRUCTION_TYPES = [
    "Interpretação", "Cálculo", "Associação de ideias", "Asserção/razão (adaptado)",
    "Interdisciplinaridade", "Atualidades/contexto social", "Experimentos", "Textos culturais/literários",
];
const DIFFICULTY_LEVELS = ['Fácil', 'Médio', 'Difícil'];
const SCHOOL_YEARS = [
    "1ª Série do Ensino Médio", "2ª Série do Ensino Médio", "3ª Série do Ensino Médio"
];

const QuestionGenerator: React.FC<{ onQuestionsGenerated: (newQuestions: Question[]) => void }> = ({ onQuestionsGenerated }) => {
    const [numQuestions, setNumQuestions] = useState(3);
    const [questionType, setQuestionType] = useState<'objective' | 'subjective'>('objective');
    const [discipline, setDiscipline] = useState('Língua Portuguesa');
    const [schoolYear, setSchoolYear] = useState('3ª Série do Ensino Médio');
    const [difficulty, setDifficulty] = useState('Médio');
    const [bloomLevel, setBloomLevel] = useState('Analisar');
    const [constructionType, setConstructionType] = useState('Interpretação');
    const [topics, setTopics] = useState('');
    const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [temperature, setTemperature] = useState(0.7);
    const [useWebSearch, setUseWebSearch] = useState(false);

    const fetchFiles = useCallback(async () => {
        const filesMeta = await storageService.getAllFilesMeta();
        setKnowledgeFiles(filesMeta);
    }, []);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);
    
    const getContextFromSelectedFiles = useCallback(async (): Promise<string> => {
        const selectedFiles = knowledgeFiles.filter(f => f.isSelected);
        if (selectedFiles.length === 0) return '';
    
        let combinedContext = '';
        for (const fileMeta of selectedFiles) {
            const fileWithContent = await storageService.getFile(fileMeta.id);
            if (fileWithContent) {
                const content = fileWithContent.indexedChunks.map(chunk => chunk.text).join('\n\n');
                combinedContext += `--- CONTEÚDO DO ARQUIVO: ${fileMeta.name} ---\n${content}\n\n`;
            }
        }
        return combinedContext;
    }, [knowledgeFiles]);

    const handleGenerateQuestions = useCallback(async () => {
        setIsLoading(true);
        setError(null);
    
        try {
            const context = await getContextFromSelectedFiles();
            
            const systemInstruction = "Você é um especialista em elaboração de questões para o ENEM, focado em criar itens de alta qualidade, contextualizados e alinhados com a Matriz de Referência. Siga estritamente as especificações e o formato JSON de saída.";
            const prompt = `
                # Pedido de Geração de Questões para o ENEM

                **1. Perfil do Gerador:**
                - Você é um especialista em elaboração de questões para o ENEM. Sua tarefa é criar questões que sejam claras, precisas, contextualizadas e que avaliem habilidades cognitivas complexas, conforme a Taxonomia de Bloom.
                - As questões devem ser originais e evitar plágio.
                - Para questões objetivas, as alternativas devem ser plausíveis, e apenas uma pode ser a correta. O gabarito deve ser indicado pelo índice da alternativa correta (0 para A, 1 para B, etc.).
                - Para questões dissertativas, a resposta esperada deve ser um guia claro e objetivo do que o aluno precisa abordar.

                **2. Parâmetros da Geração:**
                - **Quantidade:** ${numQuestions}
                - **Tipo de Questão:** ${questionType === 'objective' ? 'Objetiva de múltipla escolha (A, B, C, D, E)' : 'Dissertativa'}
                - **Disciplina:** ${discipline} (Área de Conhecimento: ${DISCIPLINE_TO_AREA_MAP[discipline]})
                - **Série/Ano:** ${schoolYear}
                - **Nível de Dificuldade:** ${difficulty}
                - **Nível de Criatividade (Temperatura):** ${temperature.toFixed(2)} - Modula a previsibilidade da resposta. Valores baixos geram respostas mais convencionais, valores altos geram respostas mais criativas ou inesperadas.
                - **Nível da Taxonomia de Bloom:** ${bloomLevel}
                - **Tipo de Construção da Questão:** ${constructionType}
                - **Tópicos/Conteúdos:** ${topics || 'Tópicos gerais da disciplina para a série especificada.'}

                **3. Contexto Adicional (se fornecido):**
                ${context ? `--- INÍCIO DO CONTEXTO ---\n${context}\n--- FIM DO CONTEXTO ---` : 'Nenhum contexto adicional foi fornecido. Baseie-se no conhecimento geral da disciplina.'}
                
                ${useWebSearch ? `
                **4. Pesquisa Web:**
                - A Pesquisa Web está ATIVADA. Utilize a busca para encontrar informações atualizadas e relevantes para a criação das questões.
                ` : ''}

                **5. Formato de Saída OBRIGATÓRIO (JSON Array):**
                - Responda com um array de objetos JSON, onde cada objeto representa uma questão.
                - A estrutura do JSON deve ser exatamente a seguinte:
                \`\`\`json
                [
                  {
                    "stem": "O enunciado completo da questão, incluindo qualquer texto de apoio, imagem (descrita como [Descrição da Imagem]), gráfico, etc.",
                    "type": "${questionType}",
                    ${questionType === 'objective' 
                      ? `"options": ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D", "Alternativa E"],
                         "answerIndex": <índice da resposta correta, de 0 a 4>`
                      : `"expectedAnswer": "A resposta detalhada esperada para a questão dissertativa."`
                    }
                  }
                ]
                \`\`\`
                - **NÃO inclua NENHUM texto, explicação ou introdução antes ou depois do array JSON.** Sua resposta deve começar com \`[\` e terminar com \`]\`.
            `;

            const response = await apiService.generate(prompt, { 
                jsonOutput: !useWebSearch, 
                systemInstruction, 
                temperature,
                useWebSearch
            });
            
            const responseText = response.text;
            let parsedQuestions;
            
            try {
                const cleanedText = responseText.replace(/^```json\s*|```\s*$/g, '').trim();
                parsedQuestions = JSON.parse(cleanedText);
            } catch (e) {
                console.error("Falha ao analisar JSON da API:", responseText);
                throw new Error("A resposta da IA não estava no formato JSON esperado. Por favor, tente novamente.");
            }

            if (!Array.isArray(parsedQuestions)) {
                throw new Error("A resposta da IA não é um array de questões.");
            }
            
            const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
              ?.map((chunk: any) => chunk.web?.uri)
              .filter((uri): uri is string => !!uri);
            
            const uniqueSources = sources ? [...new Set(sources)] : [];
            const sourcesText = uniqueSources.length > 0 
              ? `\n\n---\n**Fontes Consultadas:**\n${uniqueSources.map(url => `* ${url}`).join('\n')}`
              : '';


            const newQuestions: Question[] = parsedQuestions.map((q: any, index: number) => {
                if (!q.stem) throw new Error(`A questão ${index + 1} não possui enunciado (stem).`);

                return {
                    id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    stem: q.stem + sourcesText,
                    type: q.type,
                    options: q.options,
                    answerIndex: q.answerIndex,
                    expectedAnswer: q.expectedAnswer,
                    favorited: false,
                    discipline,
                    bloomLevel,
                    constructionType,
                    difficulty,
                    schoolYear,
                    topics: topics.split(',').map(t => t.trim()).filter(Boolean),
                    creationDate: Date.now(),
                };
            });

            onQuestionsGenerated(newQuestions);

        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro desconhecido.');
        } finally {
            setIsLoading(false);
        }
    }, [
        numQuestions, questionType, discipline, schoolYear, difficulty, bloomLevel,
        constructionType, topics, onQuestionsGenerated, getContextFromSelectedFiles,
        temperature, useWebSearch
    ]);

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-5">
                <h3 className="text-lg font-bold text-slate-800 border-b pb-3">Parâmetros de Geração</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                    <div>
                        <label htmlFor="numQuestions" className="block text-sm font-medium text-slate-700">Número de Questões</label>
                        <input
                            type="number"
                            id="numQuestions"
                            value={numQuestions}
                            onChange={e => setNumQuestions(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm"
                            min="1" max="10"
                        />
                    </div>

                     <div>
                        <label className="block text-sm font-medium text-slate-700">Tipo de Questão</label>
                        <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1">
                            <button onClick={() => setQuestionType('objective')} className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${questionType === 'objective' ? 'bg-white text-slate-800 shadow-sm' : 'bg-transparent text-slate-600 hover:bg-slate-200'}`}>Objetiva</button>
                            <button onClick={() => setQuestionType('subjective')} className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${questionType === 'subjective' ? 'bg-white text-slate-800 shadow-sm' : 'bg-transparent text-slate-600 hover:bg-slate-200'}`}>Dissertativa</button>
                        </div>
                    </div>

                    <CustomDropdown
                        id="discipline"
                        label="Disciplina"
                        options={ALL_DISCIPLINES}
                        selectedValue={discipline}
                        onSelect={setDiscipline}
                    />

                    <CustomDropdown
                        id="schoolYear"
                        label="Série/Ano"
                        options={SCHOOL_YEARS}
                        selectedValue={schoolYear}
                        onSelect={setSchoolYear}
                    />

                    <CustomDropdown
                        id="difficulty"
                        label="Nível de Dificuldade"
                        options={DIFFICULTY_LEVELS}
                        selectedValue={difficulty}
                        onSelect={setDifficulty}
                    />

                    <CustomDropdown
                        id="bloomLevel"
                        label="Nível de Bloom"
                        options={BLOOM_LEVELS}
                        selectedValue={bloomLevel}
                        onSelect={setBloomLevel}
                        tooltip="Define a complexidade cognitiva da questão, desde lembrar fatos até criar algo novo."
                    />

                    <div className="md:col-span-2">
                         <CustomDropdown
                            id="constructionType"
                            label="Tipo de Construção"
                            options={CONSTRUCTION_TYPES}
                            selectedValue={constructionType}
                            onSelect={setConstructionType}
                            tooltip="Define a abordagem ou o formato estrutural da questão (ex: interpretação de texto, cálculo)."
                        />
                    </div>
                    
                    <div className="md:col-span-2">
                       <TemperatureSlider
                            id="temperature"
                            label="Nível de Criatividade"
                            value={temperature}
                            onChange={e => setTemperature(parseFloat(e.target.value))}
                            tooltip="Controla a 'ousadia' da IA. Valores baixos geram questões mais convencionais, enquanto valores altos podem resultar em abordagens mais criativas e inesperadas."
                        />
                    </div>
                    
                    <div className="md:col-span-2">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-100 border border-slate-200">
                            <label htmlFor="web-search-toggle" className="flex items-center gap-2 cursor-pointer">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9V3m-9 9h18" />
                                </svg>
                                <span className="font-medium text-slate-700 text-sm">Pesquisa Web</span>
                            </label>
                            <button
                                type="button"
                                id="web-search-toggle"
                                onClick={() => setUseWebSearch(!useWebSearch)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 ${useWebSearch ? 'bg-cyan-600' : 'bg-slate-300'}`}
                                role="switch"
                                aria-checked={useWebSearch}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${useWebSearch ? 'translate-x-5' : 'translate-x-0'}`}
                                />
                            </button>
                        </div>
                    </div>

                    <div className="md:col-span-2">
                        <label htmlFor="topics" className="block text-sm font-medium text-slate-700">Tópicos e Conteúdos Específicos</label>
                        <input
                            type="text"
                            id="topics"
                            value={topics}
                            onChange={e => setTopics(e.target.value)}
                            placeholder="Ex: Revolução Industrial, Análise Combinatória"
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm"
                        />
                         <p className="mt-1.5 text-xs text-slate-500">
                            Separe múltiplos tópicos por vírgula. Se deixado em branco, a IA usará tópicos gerais da disciplina.
                        </p>
                    </div>

                </div>
            </div>

            <div className="flex justify-end">
                <button
                    onClick={handleGenerateQuestions}
                    disabled={isLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isLoading ? <><Spinner size="small" /> Gerando...</> : 'Gerar Questões'}
                </button>
            </div>
            {error && <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 border border-red-200">{error}</div>}
        </div>
    );
};


const QuestionBank: React.FC<{
    questions: Question[];
    onDelete: (id: string) => void;
    onToggleFavorite: (id: string) => void;
    onUpdate: (updatedQuestion: Question) => void;
}> = ({ questions, onDelete, onToggleFavorite, onUpdate }) => {
    // ... Implementation for QuestionBank
    const [filter, setFilter] = useState('');
    const [filteredQuestions, setFilteredQuestions] = useState(questions);
    const [showFavorites, setShowFavorites] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
    const [explanationModalState, setExplanationModalState] = useState<{
        isOpen: boolean;
        question: Question | null;
        explanation: string;
        isLoading: boolean;
        error: string | null;
    }>({ isOpen: false, question: null, explanation: '', isLoading: false, error: null });

    useEffect(() => {
        setFilteredQuestions(
            questions.filter(q =>
                (q.stem.toLowerCase().includes(filter.toLowerCase()) ||
                 q.discipline.toLowerCase().includes(filter.toLowerCase())) &&
                (!showFavorites || q.favorited)
            ).sort((a, b) => b.creationDate - a.creationDate)
        );
    }, [filter, questions, showFavorites]);

    const handleExplainQuestion = useCallback(async (question: Question) => {
        setExplanationModalState({ isOpen: true, question, explanation: '', isLoading: true, error: null });
        try {
            const prompt = `
                Explique detalhadamente a resolução da seguinte questão do ENEM, abordando o raciocínio necessário e justificando por que a alternativa correta é a correta e as demais são incorretas.
                
                **Questão:**
                ${question.stem}
                
                ${question.type === 'objective' && question.options ? 
                    `**Alternativas:**\n${question.options.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n')}`
                    : ''
                }
                
                **Gabarito:** ${question.type === 'objective' && typeof question.answerIndex === 'number' ? String.fromCharCode(65 + question.answerIndex) : question.expectedAnswer}
            `;
            const response = await apiService.generate(prompt);
            setExplanationModalState(prev => ({ ...prev, explanation: response.text, isLoading: false }));
        } catch (error: any) {
            setExplanationModalState(prev => ({ ...prev, error: error.message || "Erro desconhecido", isLoading: false }));
        }
    }, []);

    const closeExplanationModal = () => {
        setExplanationModalState({ isOpen: false, question: null, explanation: '', isLoading: false, error: null });
    };

    const handleSaveEdit = () => {
        if (editingQuestion) {
            onUpdate(editingQuestion);
            setEditingQuestion(null);
        }
    };
    
    if (editingQuestion) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Editando Questão</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700">Enunciado</label>
                        <textarea
                            value={editingQuestion.stem}
                            onChange={(e) => setEditingQuestion({ ...editingQuestion, stem: e.target.value })}
                            rows={6}
                            className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm"
                        />
                    </div>
                     {editingQuestion.type === 'objective' && editingQuestion.options?.map((option, index) => (
                        <div key={index}>
                            <label className="block text-sm font-medium text-slate-700">Alternativa {String.fromCharCode(65 + index)}</label>
                            <input
                                type="text"
                                value={option}
                                onChange={(e) => {
                                    const newOptions = [...editingQuestion.options!];
                                    newOptions[index] = e.target.value;
                                    setEditingQuestion({ ...editingQuestion, options: newOptions });
                                }}
                                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm"
                            />
                        </div>
                    ))}
                    <div className="flex justify-end gap-3">
                        <button onClick={() => setEditingQuestion(null)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">Cancelar</button>
                        <button onClick={handleSaveEdit} className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-md hover:bg-slate-700">Salvar</button>
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center">
                <input
                    type="text"
                    placeholder="Filtrar por enunciado ou disciplina..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="w-full rounded-md border-slate-300 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm"
                />
                <button
                    onClick={() => setShowFavorites(!showFavorites)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap transition-colors ${showFavorites ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${showFavorites ? 'text-amber-500' : 'text-slate-400'}`} viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    Mostrar Favoritas
                </button>
            </div>
            
             <div className="space-y-4">
                {filteredQuestions.length > 0 ? (
                    filteredQuestions.map(q => (
                        <div key={q.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                           <div className="flex justify-between items-start">
                                <p className="text-slate-800 whitespace-pre-wrap flex-1 pr-4">{q.stem}</p>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => onToggleFavorite(q.id)} title="Favoritar">
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-colors ${q.favorited ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-slate-400'}`} viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    </button>
                                     <button onClick={() => setEditingQuestion(q)} title="Editar" className="p-1 text-slate-400 hover:text-slate-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                                    </button>
                                    <button onClick={() => onDelete(q.id)} title="Excluir" className="p-1 text-slate-400 hover:text-red-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    </button>
                                </div>
                           </div>
                           {q.type === 'objective' && q.options && (
                                <ol className="list-[upper-alpha] list-inside pl-2 mt-2 space-y-1 text-slate-600">
                                    {q.options.map((option, index) => (
                                        <li key={index} className={q.answerIndex === index ? 'font-semibold text-cyan-800' : ''}>{option}</li>
                                    ))}
                                </ol>
                           )}
                           <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2 text-xs">
                                <span className="bg-slate-100 text-slate-700 font-medium px-2 py-1 rounded-full">{q.discipline}</span>
                                <span className="bg-cyan-50 text-cyan-700 font-medium px-2 py-1 rounded-full">{q.bloomLevel}</span>
                                <span className="bg-indigo-50 text-indigo-700 font-medium px-2 py-1 rounded-full">{q.difficulty}</span>
                           </div>
                           <div className="mt-4 flex justify-end">
                                <button onClick={() => handleExplainQuestion(q)} className="text-sm font-semibold text-cyan-700 hover:text-cyan-600">Ver Explicação</button>
                           </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-10 bg-white rounded-xl border border-slate-200">
                        <h3 className="text-lg font-semibold text-slate-700">Nenhuma questão encontrada</h3>
                        <p className="text-slate-500 mt-1">Tente ajustar seus filtros ou gere novas questões!</p>
                    </div>
                )}
            </div>
            <ExplanationModal {...explanationModalState} onClose={closeExplanationModal} />
        </div>
    );
};

// --- Exam Creator View ---
const ExamCreator: React.FC<{
    questions: Question[];
    exams: Exam[];
    onSaveExam: (exam: Exam) => void;
    onDeleteExam: (id: string) => void;
}> = ({ questions, exams, onSaveExam, onDeleteExam }) => {
    // ... Implementation for ExamCreator
    const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
    const [examName, setExamName] = useState('');
    const [viewingExam, setViewingExam] = useState<Exam | null>(null);

    const toggleQuestionSelection = (id: string) => {
        const newSet = new Set(selectedQuestionIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedQuestionIds(newSet);
    };

    const handleSave = () => {
        if (examName.trim() && selectedQuestionIds.size > 0) {
            onSaveExam({
                id: `exam_${Date.now()}`,
                name: examName,
                questionIds: Array.from(selectedQuestionIds),
                creationDate: Date.now(),
            });
            setExamName('');
            setSelectedQuestionIds(new Set());
        }
    };
    
    const generatePdf = (exam: Exam, options: { includeOptions: boolean; includeAnswerKey: boolean; }) => {
        const { jsPDF } = jspdf;
        const doc = new jsPDF();
        
        let y = 20;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;

        const addHeader = (title: string, pageNum: number) => {
             doc.setFontSize(16);
             doc.text(title, margin, y);
             doc.setFontSize(10);
             doc.text(`Página ${pageNum}`, doc.internal.pageSize.width - margin, y, { align: 'right' });
             y += 10;
             doc.setLineWidth(0.5);
             doc.line(margin, y, doc.internal.pageSize.width - margin, y);
             y += 10;
        }

        let pageNumber = 1;
        addHeader(exam.name, pageNumber);

        const examQuestions = exam.questionIds.map(id => questions.find(q => q.id === id)).filter(Boolean) as Question[];
        
        examQuestions.forEach((q, index) => {
            const questionText = `${index + 1}. ${q.stem}`;
            const splitText = doc.splitTextToSize(questionText, doc.internal.pageSize.width - margin * 2);
            
            let textHeight = splitText.length * 5; // Aprox. height
            if (q.type === 'objective' && options.includeOptions) {
                textHeight += (q.options?.length || 0) * 5 + 5;
            }

            if (y + textHeight > pageHeight - margin) {
                doc.addPage();
                pageNumber++;
                y = margin;
                addHeader(exam.name, pageNumber);
            }
            
            doc.setFontSize(12);
            doc.text(splitText, margin, y);
            y += splitText.length * 5;

            if (q.type === 'objective' && options.includeOptions && q.options) {
                y += 5;
                doc.setFontSize(11);
                q.options.forEach((opt, optIndex) => {
                    const optionText = `${String.fromCharCode(65 + optIndex)}) ${opt}`;
                    const splitOption = doc.splitTextToSize(optionText, doc.internal.pageSize.width - margin * 2 - 5);
                    doc.text(splitOption, margin + 5, y);
                    y += splitOption.length * 5;
                });
            }
            y += 10;
        });

        if (options.includeAnswerKey) {
            if (y + 20 > pageHeight - margin) {
                doc.addPage();
                pageNumber++;
                y = margin;
                addHeader(`${exam.name} - Gabarito`, pageNumber);
            } else {
                 y += 10;
            }
            doc.setFontSize(14);
            doc.text("Gabarito", margin, y);
            y += 8;
            doc.setFontSize(11);
            examQuestions.forEach((q, index) => {
                const answer = q.type === 'objective' && typeof q.answerIndex === 'number' ? String.fromCharCode(65 + q.answerIndex) : "Dissertativa";
                doc.text(`${index + 1}. ${answer}`, margin, y);
                y += 6;
                 if (y > pageHeight - margin) {
                    doc.addPage();
                    pageNumber++;
                    y = margin;
                    addHeader(`${exam.name} - Gabarito`, pageNumber);
                 }
            });
        }

        doc.save(`${exam.name.replace(/\s+/g, '_')}.pdf`);
    };

    if (viewingExam) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-slate-800">{viewingExam.name}</h3>
                    <button onClick={() => setViewingExam(null)} className="px-3 py-1.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md">Voltar</button>
                </div>
                 <div className="flex gap-3 mb-6">
                    <button onClick={() => generatePdf(viewingExam, {includeOptions: true, includeAnswerKey: true})} className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-md hover:bg-slate-700">Gerar PDF Completo</button>
                    <button onClick={() => generatePdf(viewingExam, {includeOptions: true, includeAnswerKey: false})} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200">PDF (sem gabarito)</button>
                </div>
                <div className="space-y-4">
                    {viewingExam.questionIds.map((id, index) => {
                        const q = questions.find(q => q.id === id);
                        return q ? <div key={id} className="p-4 border border-slate-200 rounded-md">
                            <p className="font-semibold text-slate-800">{index + 1}. {q.stem}</p>
                            {q.type === 'objective' && q.options && (
                                <ol className="list-[upper-alpha] list-inside pl-4 mt-2 space-y-1 text-slate-600">
                                    {q.options.map((option, optIndex) => <li key={optIndex} className={q.answerIndex === optIndex ? 'font-bold' : ''}>{option}</li>)}
                                </ol>
                            )}
                        </div> : null;
                    })}
                </div>
            </div>
        );
    }
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
                <h3 className="text-xl font-bold text-slate-800">Selecione as Questões</h3>
                {questions.map(q => (
                    <div key={q.id} className={`p-4 rounded-lg border cursor-pointer transition-colors ${selectedQuestionIds.has(q.id) ? 'bg-cyan-50 border-cyan-300' : 'bg-white border-slate-200 hover:border-slate-300'}`} onClick={() => toggleQuestionSelection(q.id)}>
                        <p className="font-semibold text-slate-800">{q.stem}</p>
                         <span className="text-xs bg-slate-100 text-slate-700 font-medium px-2 py-1 rounded-full mt-2 inline-block">{q.discipline}</span>
                    </div>
                ))}
            </div>
            <div className="lg:col-span-1 space-y-6">
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 sticky top-6">
                    <h3 className="text-xl font-bold text-slate-800 mb-4">Criar Nova Prova</h3>
                    <input
                        type="text"
                        placeholder="Nome da Prova"
                        value={examName}
                        onChange={e => setExamName(e.target.value)}
                        className="w-full rounded-md border-slate-300 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm mb-3"
                    />
                    <p className="text-sm text-slate-600 mb-4">{selectedQuestionIds.size} questões selecionadas.</p>
                    <button onClick={handleSave} disabled={!examName.trim() || selectedQuestionIds.size === 0} className="w-full bg-slate-800 text-white font-semibold py-2.5 rounded-md hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">Salvar Prova</button>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-xl font-bold text-slate-800 mb-4">Provas Salvas</h3>
                    <div className="space-y-3">
                        {exams.map(exam => (
                             <div key={exam.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-md">
                                <div>
                                    <p className="font-semibold text-slate-700">{exam.name}</p>
                                    <p className="text-xs text-slate-500">{exam.questionIds.length} questões</p>
                                </div>
                                <div className="flex gap-2">
                                     <button onClick={() => setViewingExam(exam)} className="text-sm font-semibold text-cyan-700 hover:underline">Ver</button>
                                     <button onClick={() => onDeleteExam(exam.id)} className="text-slate-400 hover:text-red-500 p-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Knowledge Base View ---
const KnowledgeBase: React.FC = () => {
    // ... Implementation for KnowledgeBase
    const [files, setFiles] = useState<KnowledgeFile[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadFiles = useCallback(async () => {
        const filesMeta = await storageService.getAllFilesMeta();
        setFiles(filesMeta);
    }, []);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);
    
    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = event.target.files;
        if (!selectedFiles || selectedFiles.length === 0) return;
        
        setIsProcessing(true);
        setError(null);
        
        try {
            const file = selectedFiles[0];
            const textContent = await fileParserService.parseFile(file);
            const chunks = ragService.chunkText(textContent);
            
            const newFile: KnowledgeFileWithContent = {
                id: `file_${Date.now()}`,
                name: file.name,
                isSelected: false,
                indexedChunks: chunks.map(text => ({ text, tfIndex: calculateTf(text) }))
            };
            
            await storageService.saveFile(newFile);
            loadFiles();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsProcessing(false);
            if(fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
        }
    };
    
    const toggleFileSelection = async (id: string) => {
        const fileToUpdate = await storageService.getFile(id);
        if (fileToUpdate) {
            fileToUpdate.isSelected = !fileToUpdate.isSelected;
            await storageService.saveFile(fileToUpdate);
            loadFiles();
        }
    };

    const deleteFile = async (id: string) => {
        await storageService.deleteFile(id);
        loadFiles();
    };

    return (
         <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
             <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h3 className="text-xl font-bold text-slate-800">Base de Conhecimento (RAG)</h3>
                <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-md hover:bg-slate-700 disabled:opacity-50">
                    {isProcessing ? 'Processando...' : 'Adicionar Arquivo'}
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.docx,.txt,.md" />
            </div>
            <p className="text-sm text-slate-500 mb-4">Faça upload de documentos (.pdf, .docx, .txt) para que a IA gere questões baseadas nesse conteúdo específico. Selecione os arquivos para incluí-los como contexto no Gerador de Questões.</p>
            {error && <div className="my-3 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>}
             <div className="space-y-3">
                {files.map(file => (
                    <div key={file.id} className={`flex items-center justify-between p-3 rounded-md border transition-colors ${file.isSelected ? 'bg-cyan-50 border-cyan-200' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center gap-3">
                             <input type="checkbox" checked={file.isSelected} onChange={() => toggleFileSelection(file.id)} className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500" />
                             <span className="font-medium text-slate-700">{file.name}</span>
                        </div>
                        <button onClick={() => deleteFile(file.id)} className="text-slate-400 hover:text-red-500 p-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                ))}
                {files.length === 0 && !isProcessing && <p className="text-center text-slate-500 py-4">Nenhum arquivo na base de conhecimento.</p>}
                {isProcessing && <div className="flex items-center gap-3 text-slate-600 p-3"><Spinner size="small" /><span>Analisando e indexando o arquivo...</span></div>}
            </div>
        </div>
    );
};


const App: React.FC = () => {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [exams, setExams] = useState<Exam[]>([]);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    
    useEffect(() => {
        storageService.init();
        setQuestions(storageService.getQuestions());
        setExams(storageService.getExams());
    }, []);

    const showNotification = (message: string, type: 'success' | 'error') => {
        setNotification({ message, type });
    };

    const handleQuestionsGenerated = useCallback((newQuestions: Question[]) => {
        const updatedQuestions = [...newQuestions, ...questions];
        setQuestions(updatedQuestions);
        storageService.saveQuestions(updatedQuestions);
        showNotification(`${newQuestions.length} novas questões geradas com sucesso!`, 'success');
    }, [questions]);
    
    const handleDeleteQuestion = useCallback((id: string) => {
        const updated = questions.filter(q => q.id !== id);
        setQuestions(updated);
        storageService.saveQuestions(updated);
        // Also remove from any exams
        const updatedExams = exams.map(exam => ({
            ...exam,
            questionIds: exam.questionIds.filter(qid => qid !== id)
        }));
        setExams(updatedExams);
        storageService.saveExams(updatedExams);
    }, [questions, exams]);
    
    const handleToggleFavorite = useCallback((id: string) => {
        const updated = questions.map(q => q.id === id ? { ...q, favorited: !q.favorited } : q);
        setQuestions(updated);
        storageService.saveQuestions(updated);
    }, [questions]);

    const handleUpdateQuestion = useCallback((updatedQuestion: Question) => {
        const updated = questions.map(q => q.id === updatedQuestion.id ? updatedQuestion : q);
        setQuestions(updated);
        storageService.saveQuestions(updated);
        showNotification('Questão atualizada com sucesso!', 'success');
    }, [questions]);
    
    const handleSaveExam = useCallback((exam: Exam) => {
        const updated = [...exams, exam];
        setExams(updated);
        storageService.saveExams(updated);
        showNotification(`Prova "${exam.name}" salva com sucesso!`, 'success');
    }, [exams]);
    
    const handleDeleteExam = useCallback((id: string) => {
        const updated = exams.filter(e => e.id !== id);
        setExams(updated);
        storageService.saveExams(updated);
    }, [exams]);

    const NavItem: React.FC<{ to: string; children: React.ReactNode; icon: React.ReactNode }> = ({ to, children, icon }) => {
        const location = useLocation();
        const isActive = location.pathname === to || (location.pathname === '/' && to === '/generator');
        return (
            <NavLink to={to} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-semibold transition-colors ${isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`}>
                {icon}
                {children}
            </NavLink>
        );
    };

    return (
        <HashRouter>
            {notification && <Notification message={notification.message} type={notification.type} onDismiss={() => setNotification(null)} />}
            <InfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} />

            <div className="flex h-screen bg-slate-100">
                <aside className="w-64 bg-slate-800 text-white p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-8">
                        <span className="text-3xl">💡</span>
                        <h1 className="text-xl font-bold">ENEM Genius</h1>
                    </div>
                    <nav className="flex-grow space-y-2">
                         <NavItem to="/generator" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0L7.18 7.39c-.19.78-.86 1.34-1.68 1.34H1.5c-1.66 0-2.34 2.02-1.08 3.07l3.54 2.8c.66.52.96 1.45.77 2.29l-1.33 4.22c-.63 2.01 1.58 3.68 3.28 2.45l3.54-2.8c.66-.52 1.62-.52 2.28 0l3.54 2.8c1.7 1.23 3.91-.44 3.28-2.45l-1.33-4.22c-.19-.84.11-1.77.77-2.29l3.54-2.8c1.26-1.05.58-3.07-1.08-3.07H14.5c-.82 0-1.49-.56-1.68-1.34l-1.33-4.22z" clipRule="evenodd" /></svg>}>
                            Gerador de Questões
                        </NavItem>
                        <NavItem to="/questions" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" /></svg>}>
                            Banco de Questões
                        </NavItem>
                        <NavItem to="/exams" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>}>
                            Criador de Provas
                        </NavItem>
                        <NavItem to="/knowledge" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0-2.443-.29 3.5-.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" /></svg>}>
                            Base de Conhecimento
                        </NavItem>
                    </nav>
                     <div className="mt-auto">
                        <button onClick={() => setIsInfoModalOpen(true)} className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-semibold w-full text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            Sobre
                        </button>
                    </div>
                </aside>
                <main className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                    <Routes>
                        <Route path="/" element={<Navigate to="/generator" replace />} />
                        <Route path="/generator" element={<QuestionGenerator onQuestionsGenerated={handleQuestionsGenerated} />} />
                        <Route path="/questions" element={<QuestionBank questions={questions} onDelete={handleDeleteQuestion} onToggleFavorite={handleToggleFavorite} onUpdate={handleUpdateQuestion} />} />
                        <Route path="/exams" element={<ExamCreator questions={questions} exams={exams} onSaveExam={handleSaveExam} onDeleteExam={handleDeleteExam} />} />
                        <Route path="/knowledge" element={<KnowledgeBase />} />
                    </Routes>
                </main>
            </div>
        </HashRouter>
    );
};

export default App;
