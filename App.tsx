

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

    const getTemperatureLabel = (temp: number) => {
        if (temp <= 0.2) return `Baixíssima (${temp.toFixed(2)})`;
        if (temp <= 0.4) return `Baixa (${temp.toFixed(2)})`;
        if (temp <= 0.6) return `Média (${temp.toFixed(2)})`;
        if (temp <= 0.8) return `Alta (${temp.toFixed(2)})`;
        return `Altíssima (${temp.toFixed(2)})`;
    };

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

                **4. Formato de Saída OBRIGATÓRIO (JSON Array):**
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

            const responseText = await api