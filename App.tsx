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
                        <p><strong>Tecnologia:</strong> Este projeto utiliza a APIFreeLLM para a geração de conteúdo por IA e IndexedDB/LocalStorage para armazenamento local no seu navegador, garantindo que seus dados permaneçam privados.</p>
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
  "1º ano do Ensino Fundamental",
  "2º ano do Ensino Fundamental",
  "3º ano do Ensino Fundamental",
  "4º ano do Ensino Fundamental",
  "5º ano do Ensino Fundamental",
  "6º ano do Ensino Fundamental",
  "7º ano do Ensino Fundamental",
  "8º ano do Ensino Fundamental",
  "9º ano do Ensino Fundamental",
  "1ª Série do Ensino Médio",
  "2ª Série do Ensino Médio",
  "3ª Série do Ensino Médio",
];

const LOADING_MESSAGES = [
    'Consultando especialistas...', 'Criando desafios do ENEM...',
    'Ajustando o nível de dificuldade...', 'Polindo os enunciados...', 'Verificando o gabarito...'
];

interface QuestionGeneratorViewProps {
    addQuestion: (question: Question) => void;
    showNotification: (message: string, type: 'success' | 'error') => void;
    knowledgeFiles: KnowledgeFile[];
    onEditQuestion: (question: Question) => void;
}

const QuestionGeneratorView: React.FC<QuestionGeneratorViewProps> = ({ addQuestion, showNotification, knowledgeFiles, onEditQuestion }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
    const [explainingQuestion, setExplainingQuestion] = useState<Question | null>(null);
    const [explanationState, setExplanationState] = useState<{ content: string; isLoading: boolean; error: string | null }>({
        content: '', isLoading: false, error: null,
    });
    const [currentLoadingMessage, setCurrentLoadingMessage] = useState(LOADING_MESSAGES[0]);

    // Form state
    const [selectedDiscipline, setSelectedDiscipline] = useState(ALL_DISCIPLINES[0]);
    const [selectedArea, setSelectedArea] = useState(DISCIPLINE_TO_AREA_MAP[ALL_DISCIPLINES[0]]);
    const [schoolYear, setSchoolYear] = useState(SCHOOL_YEARS[11]);
    const [difficulty, setDifficulty] = useState(DIFFICULTY_LEVELS[1]); // Default 'Médio'
    const [bloomLevel, setBloomLevel] = useState(BLOOM_LEVELS[2]); // 'Aplicar' as default
    const [constructionType, setConstructionType] = useState(CONSTRUCTION_TYPES[0]);
    const [numQuestions, setNumQuestions] = useState(3);
    const [topic, setTopic] = useState('');
    const [questionType, setQuestionType] = useState<'objective' | 'subjective'>('objective');

    const BLOOM_LEVEL_COLORS: { [key: string]: string } = {
        'Lembrar': 'bg-slate-100 text-slate-800',
        'Entender': 'bg-green-100 text-green-800',
        'Aplicar': 'bg-cyan-100 text-cyan-800',
        'Analisar': 'bg-purple-100 text-purple-800',
        'Avaliar': 'bg-orange-100 text-orange-800',
        'Criar': 'bg-red-100 text-red-800',
    };

    useEffect(() => {
        let interval: number;
        if (isLoading) {
            interval = window.setInterval(() => {
                setCurrentLoadingMessage(prev => {
                    const currentIndex = LOADING_MESSAGES.indexOf(prev);
                    const nextIndex = (currentIndex + 1) % LOADING_MESSAGES.length;
                    return LOADING_MESSAGES[nextIndex];
                });
            }, 2500);
        }
        return () => clearInterval(interval);
    }, [isLoading]);

    const handleDisciplineChange = (newDiscipline: string) => {
        setSelectedDiscipline(newDiscipline);
        setSelectedArea(DISCIPLINE_TO_AREA_MAP[newDiscipline]);
    };

    const handleDifficultyChange = (newDifficulty: string) => {
        setDifficulty(newDifficulty);
    };

    const handleGenerateQuestions = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const selectedFiles = knowledgeFiles.filter(f => f.isSelected);
        if (selectedFiles.length > 0 && !topic.trim()) {
            showNotification("É necessário especificar um tópico ao usar arquivos da base de conhecimento.", 'error');
            return;
        }

        setIsLoading(true);
        setGeneratedQuestions([]);

        try {
            let context = '';
            if (selectedFiles.length > 0) {
                const allFileContents = await Promise.all(
                    selectedFiles.map(fileMeta => storageService.getFile(fileMeta.id))
                );
                const allChunks = allFileContents
                    .filter((file): file is KnowledgeFileWithContent => !!file)
                    .flatMap(file => file.indexedChunks);

                const queryTerms = tokenizeAndClean(topic);

                if (queryTerms.length > 0 && allChunks.length > 0) {
                    const scoredChunks = allChunks.map(chunk => {
                        const score = queryTerms.reduce((acc, term) => acc + (chunk.tfIndex[term] || 0), 0);
                        return { text: chunk.text, score };
                    }).filter(chunk => chunk.score > 0);

                    scoredChunks.sort((a, b) => b.score - a.score);

                    const MAX_CONTEXT_LENGTH = 8000;
                    let currentContextLength = 0;
                    const relevantChunks: string[] = [];

                    for (const chunk of scoredChunks) {
                        if (currentContextLength + chunk.text.length > MAX_CONTEXT_LENGTH) break;
                        relevantChunks.push(chunk.text);
                        currentContextLength += chunk.text.length;
                    }
                    
                    if (relevantChunks.length > 0) {
                        context = relevantChunks.join('\n\n---\n\n');
                    } else {
                        context = allChunks.slice(0, 5).map(chunk => chunk.text).join('\n\n---\n\n');
                    }
                } else if (allChunks.length > 0) {
                    context = allChunks.slice(0, 5).map(chunk => chunk.text).join('\n\n---\n\n');
                }
            }
            const topicsList = topic.trim() ? topic.split(',').map(t => t.trim()).filter(t => t) : [];

            const jsonStructure = questionType === 'objective'
                ? `{ "stem": "O enunciado completo, incluindo o texto de apoio/contexto.", "options": ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D", "Alternativa E"], "answerIndex": 0, "discipline": "${selectedDiscipline}", "bloomLevel": "${bloomLevel}", "constructionType": "${constructionType}", "difficulty": "${difficulty}", "schoolYear": "${schoolYear}", "topics": ${JSON.stringify(topicsList)} }`
                : `{ "stem": "O enunciado completo, incluindo o texto de apoio/contexto.", "expectedAnswer": "A resposta dissertativa completa e bem fundamentada aqui.", "discipline": "${selectedDiscipline}", "bloomLevel": "${bloomLevel}", "constructionType": "${constructionType}", "difficulty": "${difficulty}", "schoolYear": "${schoolYear}", "topics": ${JSON.stringify(topicsList)} }`;

            const prompt = `
                Aja como um especialista em elaboração de questões para o ENEM, com profundo conhecimento da Base Nacional Comum Curricular (BNCC).
                Sua tarefa é criar ${numQuestions} questão(ões) ${questionType === 'objective' ? 'de múltipla escolha (A, B, C, D, E)' : 'SUBJETIVAS (dissertativas)'} que sejam ricas em contexto e estritamente alinhadas à BNCC.

                **PARÂMETROS DA QUESTÃO:**
                - Nível de Ensino (Série/Ano): ${schoolYear}
                - Área de Conhecimento: ${selectedArea}
                - Disciplina: ${selectedDiscipline}
                - Nível de Dificuldade: ${difficulty}
                - Nível da Taxonomia de Bloom (referência): ${bloomLevel}
                - Tipo de Construção: ${constructionType}
                - Tópico(s) Específico(s): ${topic || 'Conhecimentos gerais da disciplina'}

                ${context ? `**BASE DE CONHECIMENTO (RAG):**\nUtilize o seguinte texto como base de conhecimento para criar as questões (o texto foi selecionado por relevância ao tópico):\n---\n${context}\n---` : ''}

                **REGRAS OBRIGATÓRIAS DE CRIAÇÃO:**
                1.  **ALINHAMENTO COM A BNCC:** A questão DEVE ser estritamente alinhada às competências e habilidades da BNCC para a disciplina e o ano escolar especificados. A abordagem deve ser interdisciplinar sempre que possível, conectando o tópico a outras áreas do conhecimento.
                2.  **CONTEXTUALIZAÇÃO PROFUNDA:** CADA QUESTÃO DEVE APRESENTAR UM CENÁRIO. O enunciado ('stem') precisa conter um texto de apoio, um poema, uma situação-problema, um trecho de notícia, ou a descrição de um elemento visual (gráfico, tabela, imagem). A questão não pode ser uma pergunta direta e descontextualizada. O objetivo é avaliar a capacidade do aluno de analisar, interpretar e aplicar conhecimento em um contexto significativo.
                3.  **SUPORTE VISUAL (QUANDO APLICÁvel):** Se a questão exigir um elemento visual (gráfico, imagem, charge), NÃO CRIE A IMAGEM. Em vez disso, descreva-a de forma rica e detalhada para que uma IA de imagem possa gerá-la. Formate a descrição da seguinte forma: [DESCRIÇÃO PARA GERAR IMAGEM: ...descrição detalhada aqui...]. O comando da questão deve vir após essa descrição.
                
                **REGRAS DE FORMATAÇÃO DA SAÍDA:**
                - Sua resposta DEVE ser um array JSON válido, sem nenhum texto introdutório, final ou explicações.
                - NÃO envolva o JSON em blocos de código markdown como \`\`\`json.
                - A resposta deve ser APENAS o array de objetos JSON.
                - O array deve conter exatamente ${numQuestions} objeto(s).
                - A estrutura de cada objeto no array deve ser:
                ${jsonStructure}
            `;
            
            const responseText = await apiService.generate(prompt);
            
            const parsedQuestions = JSON.parse(responseText);
            
            const newQuestions: Question[] = parsedQuestions.map((q: any) => ({
                id: crypto.randomUUID(),
                stem: q.stem,
                options: q.options,
                answerIndex: q.answerIndex,
                expectedAnswer: q.expectedAnswer,
                favorited: false,
                discipline: q.discipline || selectedDiscipline,
                bloomLevel: q.bloomLevel || bloomLevel,
                constructionType: q.constructionType || constructionType,
                difficulty: q.difficulty || difficulty,
                schoolYear: q.schoolYear || schoolYear,
                type: questionType,
                topics: q.topics || topicsList,
                creationDate: Date.now(),
            }));

            setGeneratedQuestions(newQuestions);

        } catch (error) {
            console.error("Erro ao gerar questões:", error);
            const errorMessage = error instanceof Error ? error.message : "Ocorreu uma falha ao gerar as questões. A resposta da IA pode estar em um formato inesperado.";
            showNotification(errorMessage, 'error');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSaveQuestion = (questionToSave: Question) => {
        addQuestion(questionToSave);
        setGeneratedQuestions(prev => prev.filter(q => q.id !== questionToSave.id));
        showNotification("Questão salva no banco!", 'success');
    };

    const handleExplainAnswer = async (question: Question) => {
        if (question.type !== 'objective' || !question.options || typeof question.answerIndex !== 'number') return;
        setExplainingQuestion(question);
        setExplanationState({ content: '', isLoading: true, error: null });
        try {
            const optionsText = question.options.map((opt, i) => `${String.fromCharCode(65 + i)}) ${opt}`).join('\n');
            const prompt = `
                Aja como um professor especialista na disciplina de ${question.discipline}.
                Analise a seguinte questão de múltipla escolha:
                **Enunciado:** ${question.stem}
                **Alternativas:**\n${optionsText}
                A alternativa correta é a **${String.fromCharCode(65 + question.answerIndex)}**.
                **Sua tarefa é:**
                1.  **Análise da Alternativa Correta:** Explique claramente por que a alternativa ${String.fromCharCode(65 + question.answerIndex)} é a correta.
                2.  **Análise das Alternativas Incorretas:** Explique brevemente por que cada uma das outras alternativas está incorreta.
                Formate sua resposta de maneira didática, usando negrito para destacar termos importantes.
                A resposta deve ser APENAS o texto da explicação, sem introduções.
            `;
            const explanationText = await apiService.generate(prompt);
            setExplanationState({ content: explanationText, isLoading: false, error: null });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Falha ao gerar a explicação.";
            setExplanationState({ content: '', isLoading: false, error: errorMessage });
        }
    };

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <form onSubmit={handleGenerateQuestions} className="bg-white p-6 rounded-lg border border-slate-200 space-y-6">
                        <fieldset>
                            <legend className="text-lg font-semibold text-slate-800 mb-4">Parâmetros da Questão</legend>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <label className="block text-sm font-medium text-slate-700">Tipo de Questão</label>
                                        <InfoTooltip text="Define se a questão será de múltipla escolha (objetiva) ou dissertativa (subjetiva)." />
                                    </div>
                                    <div className="flex gap-4 rounded-md border border-slate-300 p-1 bg-slate-50">
                                        {(['objective', 'subjective'] as const).map(type => (
                                            <button key={type} type="button" onClick={() => setQuestionType(type)}
                                                className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${questionType === type ? 'bg-white shadow-sm text-cyan-700 font-semibold' : 'bg-transparent text-slate-600 hover:bg-slate-200'}`}>
                                                {type === 'objective' ? 'Objetiva' : 'Subjetiva'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="sm:col-span-2">
                                        <CustomDropdown id="discipline" label="Disciplina" options={ALL_DISCIPLINES} selectedValue={selectedDiscipline} onSelect={handleDisciplineChange} tooltip="Escolha a matéria escolar para a qual a questão será gerada." />
                                        <p className="mt-1 text-xs text-slate-500">
                                            Área: <span className="font-semibold">{selectedArea}</span>
                                        </p>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <CustomDropdown id="schoolYear" label="Série/Ano" options={SCHOOL_YEARS} selectedValue={schoolYear} onSelect={setSchoolYear} tooltip="Selecione o ano letivo do aluno para adequar a complexidade da questão." />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <label className="block text-sm font-medium text-slate-700">Níveis da Taxonomia de Bloom</label>
                                            <InfoTooltip text="Selecione o nível cognitivo que a questão deve avaliar, segundo a Taxonomia de Bloom." />
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {BLOOM_LEVELS.map(level => (
                                                <button
                                                    key={level}
                                                    type="button"
                                                    onClick={() => setBloomLevel(level)}
                                                    className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 ${
                                                        BLOOM_LEVEL_COLORS[level]
                                                    } ${
                                                        bloomLevel === level
                                                            ? 'ring-2 ring-offset-2 ring-cyan-500 shadow-md'
                                                            : 'opacity-80 hover:opacity-100'
                                                    }`}
                                                >
                                                    {level}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <CustomDropdown id="difficulty" label="Nível de Dificuldade" options={DIFFICULTY_LEVELS} selectedValue={difficulty} onSelect={handleDifficultyChange} tooltip="Define a dificuldade geral da questão." />
                                    </div>
                                    <CustomDropdown id="construction" label="Tipo de Construção" options={CONSTRUCTION_TYPES} selectedValue={constructionType} onSelect={setConstructionType} tooltip="Determina o formato e a abordagem da questão, como interpretação de texto, cálculo, ou análise de contexto social." />
                                </div>
                            </div>
                        </fieldset>
                        <fieldset>
                            <legend className="text-lg font-semibold text-slate-800 mb-4">Conteúdo Específico</legend>
                            <div className="space-y-4">
                                 <div>
                                    <div className="flex items-center gap-1.5">
                                        <label htmlFor="numQuestions" className="block text-sm font-medium text-slate-700">Número de Questões (1-10)</label>
                                        <InfoTooltip text="Especifique quantas questões (entre 1 e 10) devem ser geradas de uma só vez." />
                                    </div>
                                    <input type="number" id="numQuestions" value={numQuestions} onChange={e => setNumQuestions(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))} min="1" max="10" className="mt-1 focus:ring-cyan-500 focus:border-cyan-500 block w-full shadow-sm sm:text-sm border-slate-300 rounded-md" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <label htmlFor="topic" className="block text-sm font-medium text-slate-700">Tópico/Conteúdo (Obrigatório com arquivo)</label>
                                        <InfoTooltip text="Descreva o(s) assunto(s) da questão, separados por vírgula. Este campo é obrigatório se você selecionou um arquivo da Base de Conhecimento." />
                                    </div>
                                    <textarea id="topic" value={topic} onChange={e => setTopic(e.target.value)} rows={3} className="mt-1 focus:ring-cyan-500 focus:border-cyan-500 block w-full shadow-sm sm:text-sm border-slate-300 rounded-md" placeholder="Ex: Revolução Francesa, Análise Combinatória..."></textarea>
                                </div>
                            </div>
                        </fieldset>
                        <div className="space-y-4 pt-4 border-t border-slate-200">
                             <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600">
                                <p>
                                    Você irá gerar <strong className="text-slate-800">{numQuestions} questão(ões) {questionType === 'objective' ? 'objetiva(s)' : 'subjetiva(s)'}</strong> de <strong className="text-slate-800">{selectedDiscipline}</strong> para <strong className="text-slate-800">{schoolYear}</strong>,
                                    nível <strong className="text-slate-800">{difficulty}</strong>{topic.trim() ? <> sobre <strong className="text-slate-800">{topic.trim()}</strong></> : ''}.
                                </p>
                            </div>
                            <button type="submit" disabled={isLoading} className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all duration-200">
                                {isLoading ? <Spinner size="small" /> : 'Gerar Questões'}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="lg:col-span-2">
                    <div className="bg-white p-6 rounded-lg border border-slate-200 min-h-[400px] relative">
                        {isLoading ? (
                             <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center h-full text-center text-slate-600 transition-opacity duration-300">
                                 <Spinner size="large" />
                                 <p className="mt-4 text-lg font-semibold">{currentLoadingMessage}</p>
                                 <p className="text-sm">Isso pode levar alguns instantes.</p>
                             </div>
                        ) : generatedQuestions.length > 0 ? (
                            <>
                                <h3 className="text-lg font-semibold text-slate-800 mb-4">Resultados para: {generatedQuestions.length} questão(ões) de {generatedQuestions[0].discipline}</h3>
                                <ul className="space-y-4">
                                    {generatedQuestions.map(q => (
                                        <li key={q.id} className="bg-slate-50 p-4 rounded-md border border-slate-200 transition-shadow hover:shadow-md">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="inline-block bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{q.constructionType}</span>
                                                {q.type === 'subjective' && <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Subjetiva</span>}
                                            </div>
                                            <p className="text-slate-800 font-medium whitespace-pre-wrap">{q.stem}</p>
                                            {q.type === 'objective' && q.options && typeof q.answerIndex === 'number' && (
                                                <>
                                                    <ol className="list-[upper-alpha] list-inside pl-2 mt-2 space-y-1 text-slate-600">
                                                        {q.options.map((option, index) => <li key={index} className={q.answerIndex === index ? 'font-semibold text-cyan-800' : ''}>{option}</li>)}
                                                    </ol>
                                                    <p className="text-sm font-bold text-slate-800 mt-2">Gabarito: {String.fromCharCode(65 + q.answerIndex)}</p>
                                                </>
                                            )}
                                            <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-200 pt-2">
                                                 {q.type === 'objective' && (
                                                    <button onClick={() => handleExplainAnswer(q)} className="px-3 py-1 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
                                                        Explicar Resposta
                                                    </button>
                                                )}
                                                <button onClick={() => handleSaveQuestion(q)} className="px-3 py-1 text-xs font-semibold text-cyan-700 bg-cyan-100 hover:bg-cyan-200 rounded-full transition-colors">
                                                    Salvar
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                                <p className="mt-4 font-semibold">As questões geradas aparecerão aqui.</p>
                                <p className="text-sm">Preencha o formulário e clique em "Gerar Questões".</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <ExplanationModal
                isOpen={!!explainingQuestion}
                onClose={() => setExplainingQuestion(null)}
                question={explainingQuestion}
                explanation={explanationState.content}
                isLoading={explanationState.isLoading}
                error={explanationState.error}
            />
        </>
    );
};


// --- Question Bank View ---

interface QuestionBankViewProps {
    questions: Question[];
    setQuestions: (updatedQuestions: Question[]) => void;
    showNotification: (message: string, type: 'success' | 'error') => void;
    onEditQuestion: (question: Question) => void;
}

const QUESTIONS_PER_PAGE = 10;
type SortOrder = 'newest' | 'oldest';


const getPaginationItems = (currentPage: number, totalPages: number): (number | string)[] => {
    if (totalPages <= 7) { // Se 7 ou menos páginas, mostra todas
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pagesToShow = new Set<number>();
    pagesToShow.add(1);
    pagesToShow.add(totalPages);
    pagesToShow.add(currentPage);

    for (let i = -1; i <= 1; i++) { // Adiciona vizinhos da página atual
        const page = currentPage + i;
        if (page > 1 && page < totalPages) {
            pagesToShow.add(page);
        }
    }

    const sortedPages = Array.from(pagesToShow).sort((a, b) => a - b);
    const result: (number | string)[] = [];
    let lastPage = 0;

    for (const page of sortedPages) {
        if (lastPage !== 0 && page > lastPage + 1) {
            result.push('...');
        }
        result.push(page);
        lastPage = page;
    }

    return result;
};


const QuestionBankView: React.FC<QuestionBankViewProps> = ({ questions, setQuestions, showNotification, onEditQuestion }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [filterDiscipline, setFilterDiscipline] = useState('Todas');
    const [filterBloom, setFilterBloom] = useState('Todos');
    const [filterSchoolYear, setFilterSchoolYear] = useState('Todos os Anos');
    const [filterFavorited, setFilterFavorited] = useState(false);
    const [filterTopic, setFilterTopic] = useState('');
    const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
    const [isExportOpen, setIsExportOpen] = useState(false);
    const exportRef = useRef<HTMLDivElement>(null);

    const BLOOM_LEVEL_COLORS: { [key: string]: string } = {
        'Lembrar': 'bg-slate-100 text-slate-800',
        'Entender': 'bg-green-100 text-green-800',
        'Aplicar': 'bg-cyan-100 text-cyan-800',
        'Analisar': 'bg-purple-100 text-purple-800',
        'Avaliar': 'bg-orange-100 text-orange-800',
        'Criar': 'bg-red-100 text-red-800',
    };

    const filteredQuestions = useMemo(() => {
        const lowercasedTopic = filterTopic.toLowerCase();
        
        const filtered = questions.filter(q => {
            const disciplineMatch = filterDiscipline === 'Todas' || q.discipline === filterDiscipline;
            const bloomMatch = filterBloom === 'Todos' || q.bloomLevel === filterBloom;
            const favoritedMatch = !filterFavorited || q.favorited;
            const schoolYearMatch = filterSchoolYear === 'Todos os Anos' || q.schoolYear === filterSchoolYear;
            const topicMatch = filterTopic === '' || (q.topics && q.topics.some(t => t.toLowerCase().includes(lowercasedTopic)));
            return disciplineMatch && bloomMatch && favoritedMatch && schoolYearMatch && topicMatch;
        });

        return filtered.sort((a, b) => {
             // Se o filtro "Apenas Favoritas" não estiver ativo, priorize as favoritadas
            if (!filterFavorited) {
                if (a.favorited && !b.favorited) return -1;
                if (!a.favorited && b.favorited) return 1;
            }
            
            // Ordenação por data
            const dateA = a.creationDate || 0;
            const dateB = b.creationDate || 0;
            return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
        });
    }, [questions, filterDiscipline, filterBloom, filterFavorited, filterSchoolYear, filterTopic, sortOrder]);
    
    const totalQuestions = filteredQuestions.length;
    const favoritedQuestionsCount = filteredQuestions.filter(q => q.favorited).length;


    useEffect(() => {
        setCurrentPage(1);
    }, [filterDiscipline, filterBloom, filterFavorited, filterSchoolYear, filterTopic, sortOrder]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
                setIsExportOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const totalPages = Math.ceil(filteredQuestions.length / QUESTIONS_PER_PAGE);
    const startIndex = (currentPage - 1) * QUESTIONS_PER_PAGE;
    const currentQuestions = filteredQuestions.slice(startIndex, startIndex + QUESTIONS_PER_PAGE);
    const paginationItems = useMemo(() => getPaginationItems(currentPage, totalPages), [currentPage, totalPages]);


    const handleToggleFavorite = (questionId: string) => {
        const updatedQuestions = questions.map(q =>
            q.id === questionId ? { ...q, favorited: !q.favorited } : q
        );
        setQuestions(updatedQuestions);
    };

    const handleDeleteQuestion = (questionId: string) => {
        if (window.confirm("Tem certeza que deseja excluir esta questão?")) {
            const updatedQuestions = questions.filter(q => q.id !== questionId);
            setQuestions(updatedQuestions);
            if (currentQuestions.length === 1 && currentPage > 1) {
                setCurrentPage(currentPage - 1);
            }
            showNotification("Questão excluída com sucesso.", 'success');
        }
    };

    const handleCopyQuestion = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('Enunciado copiado para a área de transferência.', 'success');
        }).catch(err => {
            console.error('Falha ao copiar texto: ', err);
            showNotification('Não foi possível copiar o enunciado.', 'error');
        });
    };

    const handleExport = (format: 'json' | 'csv' | 'pdf') => {
        setIsExportOpen(false);
        if (filteredQuestions.length === 0) {
            showNotification('Nenhuma questão para exportar com os filtros atuais.', 'error');
            return;
        }

        if (format === 'json') {
            const fileContent = JSON.stringify(filteredQuestions, null, 2);
            const blob = new Blob([fileContent], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'enem_genius_questoes.json';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            showNotification(`Questões exportadas para JSON!`, 'success');
            return;
        }
        
        if (format === 'csv') {
            const headers = ['id', 'stem', 'type', 'options', 'answerIndex', 'expectedAnswer', 'favorited', 'discipline', 'bloomLevel', 'constructionType', 'difficulty', 'schoolYear', 'topics', 'creationDate'];
            const escapeCSV = (value: any): string => {
                if (value == null) return '';
                let str = String(value);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    str = '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            };

            const rows = filteredQuestions.map(q => {
                return headers.map(header => {
                    let value = (q as any)[header];
                    if ((header === 'options' || header === 'topics') && Array.isArray(value)) {
                        value = JSON.stringify(value);
                    }
                    if (header === 'creationDate' && typeof value === 'number') {
                        value = new Date(value).toISOString();
                    }
                    return escapeCSV(value);
                }).join(',');
            });
            
            const fileContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
            const blob = new Blob([fileContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'enem_genius_questoes.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            showNotification(`Questões exportadas para CSV!`, 'success');
            return;
        }

        if (format === 'pdf') {
            try {
                if (typeof jspdf === 'undefined') {
                    throw new Error('A biblioteca de geração de PDF (jsPDF) não foi carregada.');
                }

                const { jsPDF } = jspdf;
                const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

                const page = {
                    width: doc.internal.pageSize.getWidth(),
                    height: doc.internal.pageSize.getHeight(),
                    margin: { top: 40, right: 40, bottom: 40, left: 40 }
                };
                const contentWidth = page.width - page.margin.left - page.margin.right;
                let y = page.margin.top;

                const addPageIfNeeded = (requiredHeight: number) => {
                    if (y + requiredHeight > page.height - page.margin.bottom) {
                        doc.addPage();
                        y = page.margin.top;
                    }
                };

                doc.setFontSize(18);
                doc.setFont('helvetica', 'bold');
                doc.text('Banco de Questões - ENEM Genius', page.width / 2, y, { align: 'center' });
                y += 40;

                const answerKey: { question: number; answer: string }[] = [];
                const subjectiveAnswers: { question: number; text: string }[] = [];

                filteredQuestions.forEach((q, index) => {
                    const questionNumber = index + 1;

                    const questionHeader = `Questão ${questionNumber}:`;
                    doc.setFontSize(12);
                    doc.setFont('helvetica', 'bold');

                    const stemLines = doc.splitTextToSize(q.stem, contentWidth);
                    let optionsHeight = 0;
                    if (q.type === 'objective' && q.options) {
                        q.options.forEach(opt => {
                            optionsHeight += doc.splitTextToSize(opt, contentWidth - 20).length * 14;
                        });
                    }
                    const estimatedHeight = 20 + (stemLines.length * 14) + optionsHeight + 10;
                    addPageIfNeeded(estimatedHeight);

                    doc.text(questionHeader, page.margin.left, y);
                    y += 20;

                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'normal');
                    doc.text(stemLines, page.margin.left, y);
                    y += stemLines.length * 14;

                    if (q.type === 'objective' && q.options) {
                        y += 5;
                        q.options.forEach((option, optIndex) => {
                            const optionLabel = `${String.fromCharCode(65 + optIndex)}) `;
                            const optionLines = doc.splitTextToSize(option, contentWidth - 20);
                            addPageIfNeeded((optionLines.length * 14) + 5);
                            doc.text(optionLabel, page.margin.left, y);
                            doc.text(optionLines, page.margin.left + 20, y);
                            y += (optionLines.length * 14) + 5;
                        });
                        if (typeof q.answerIndex === 'number') {
                            answerKey.push({ question: questionNumber, answer: String.fromCharCode(65 + q.answerIndex) });
                        }
                    } else {
                        answerKey.push({ question: questionNumber, answer: 'Resposta dissertativa' });
                        if (q.expectedAnswer) {
                            subjectiveAnswers.push({ question: questionNumber, text: q.expectedAnswer });
                        }
                    }
                    y += 15;
                });

                if (answerKey.length > 0) {
                    addPageIfNeeded(page.height);
                    doc.setFontSize(16);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Gabarito', page.margin.left, y);
                    y += 30;
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'normal');
                    answerKey.forEach(item => {
                        const answerText = `Questão ${item.question}: ${item.answer}`;
                        addPageIfNeeded(20);
                        doc.text(answerText, page.margin.left, y);
                        y += 20;
                    });
                }

                if (subjectiveAnswers.length > 0) {
                    addPageIfNeeded(page.height);
                    doc.setFontSize(16);
                    doc.setFont('helvetica', 'bold');
                    doc.text('Respostas Esperadas (Dissertativas)', page.margin.left, y);
                    y += 30;
                    subjectiveAnswers.forEach(item => {
                        const header = `Questão ${item.question}:`;
                        const answerLines = doc.splitTextToSize(item.text, contentWidth);
                        const estimatedHeight = 20 + (answerLines.length * 14) + 10;
                        addPageIfNeeded(estimatedHeight);
                        doc.setFontSize(12);
                        doc.setFont('helvetica', 'bold');
                        doc.text(header, page.margin.left, y);
                        y += 20;
                        doc.setFontSize(11);
                        doc.setFont('helvetica', 'normal');
                        doc.text(answerLines, page.margin.left, y);
                        y += (answerLines.length * 14) + 10;
                    });
                }

                doc.save('banco_de_questoes_enem_genius.pdf');
                showNotification('PDF gerado com sucesso!', 'success');

            } catch (error) {
                console.error("Falha ao gerar PDF:", error);
                const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido durante a geração do PDF.";
                showNotification(`Falha ao gerar o PDF: ${errorMessage}`, 'error');
            }
        }
    };

    const goToPage = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    };

    if (questions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 bg-white p-6 rounded-lg border border-slate-200 min-h-[400px]">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                <p className="mt-4 font-semibold">Seu banco de questões está vazio.</p>
                <p className="text-sm">Gere e salve novas questões para vê-las aqui.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-lg border border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center gap-4">
                    <div className="bg-cyan-100 text-cyan-600 p-3 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">Total de Questões (filtrado)</p>
                        <p className="text-2xl font-bold text-slate-800">{totalQuestions}</p>
                    </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center gap-4">
                     <div className="bg-amber-100 text-amber-600 p-3 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">Questões Favoritas</p>
                        <p className="text-2xl font-bold text-slate-800">{favoritedQuestionsCount}</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6 pb-6 border-b border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                    <CustomDropdown
                        id="filter-discipline"
                        label="Filtrar por Disciplina"
                        options={['Todas', ...ALL_DISCIPLINES]}
                        selectedValue={filterDiscipline}
                        onSelect={setFilterDiscipline}
                    />
                    <CustomDropdown
                        id="filter-bloom"
                        label="Filtrar por Nível de Bloom"
                        options={['Todos', ...BLOOM_LEVELS]}
                        selectedValue={filterBloom}
                        onSelect={setFilterBloom}
                    />
                    <CustomDropdown
                        id="filter-school-year"
                        label="Filtrar por Ano Escolar"
                        options={['Todos os Anos', ...SCHOOL_YEARS]}
                        selectedValue={filterSchoolYear}
                        onSelect={setFilterSchoolYear}
                    />
                    <CustomDropdown
                        id="sort-order"
                        label="Ordenar por"
                        options={['Mais Recentes', 'Mais Antigas']}
                        selectedValue={sortOrder === 'newest' ? 'Mais Recentes' : 'Mais Antigas'}
                        onSelect={(value) => setSortOrder(value === 'Mais Recentes' ? 'newest' : 'oldest')}
                    />
                    <div className="lg:col-span-2">
                        <label htmlFor="filter-topic" className="block text-sm font-medium text-slate-700">Filtrar por Tópico</label>
                        <input
                            type="text"
                            id="filter-topic"
                            value={filterTopic}
                            onChange={(e) => setFilterTopic(e.target.value)}
                            placeholder="Digite um tópico..."
                            className="mt-1 focus:ring-cyan-500 focus:border-cyan-500 block w-full shadow-sm sm:text-sm border-slate-300 rounded-md"
                        />
                    </div>
                    <div className="flex items-end">
                        <label className="flex items-center gap-2 mt-1 w-full h-[38px] cursor-pointer p-2 rounded-md border border-slate-300 bg-white shadow-sm hover:bg-slate-50">
                            <input
                                type="checkbox"
                                checked={filterFavorited}
                                onChange={(e) => setFilterFavorited(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                            />
                            <span className="text-sm font-medium text-slate-700">Apenas Favoritas</span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="flex justify-end mb-4">
                <div className="relative" ref={exportRef}>
                    <button onClick={() => setIsExportOpen(!isExportOpen)} className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500">
                        Exportar Questões
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                    {isExportOpen && (
                        <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                            <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                                <button onClick={() => handleExport('json')} className="w-full text-left block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100" role="menuitem">
                                    Exportar para JSON
                                </button>
                                <button onClick={() => handleExport('csv')} className="w-full text-left block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100" role="menuitem">
                                    Exportar para CSV
                                </button>
                                <button onClick={() => handleExport('pdf')} className="w-full text-left block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100" role="menuitem">
                                    Exportar para PDF
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {filteredQuestions.length === 0 ? (
                <div className="text-center text-slate-500 py-8">
                     <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                     <p className="mt-4 font-semibold">Nenhuma questão encontrada.</p>
                     <p className="text-sm">Tente ajustar os filtros ou adicione mais questões ao banco.</p>
                </div>
            ) : (
                <>
                    <ul className="divide-y divide-slate-200">
                        {currentQuestions.map((q, index) => (
                            <li key={q.id} className="py-4 group">
                                <div className="cursor-pointer" onClick={() => onEditQuestion(q)}>
                                     <p className="font-semibold text-slate-600 mb-2">Questão {startIndex + index + 1}</p>
                                     <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <span className="inline-block bg-sky-100 text-sky-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{DISCIPLINE_TO_AREA_MAP[q.discipline] || 'N/A'}</span>
                                        <span className="inline-block bg-teal-100 text-teal-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{q.discipline}</span>
                                        {q.schoolYear && <span className="inline-block bg-pink-100 text-pink-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{q.schoolYear}</span>}
                                        <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{q.difficulty}</span>
                                        <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${BLOOM_LEVEL_COLORS[q.bloomLevel] || 'bg-gray-100 text-gray-800'}`}>{q.bloomLevel}</span>
                                        <span className="inline-block bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{q.constructionType}</span>
                                        {q.type === 'subjective' && (
                                             <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Subjetiva</span>
                                        )}
                                        {q.topics && q.topics.length > 0 && (
                                            <span 
                                                className="inline-flex items-center gap-1 bg-slate-200 text-slate-800 text-xs font-medium px-2.5 py-0.5 rounded-full"
                                                title={`Tópicos: ${q.topics.join(', ')}`}>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                  <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 013 9V5a2 2 0 012-2h4a.997.997 0 01.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                                </svg>
                                                Categorizada
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-slate-800 font-medium whitespace-pre-wrap group-hover:text-cyan-700">{q.stem}</p>
                                    <p className="text-xs text-slate-500 mt-2">{formatDate(q.creationDate)}</p>
                                    {q.topics && q.topics.length > 0 && (
                                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                            {q.topics.map((topic, index) => (
                                                <span key={index} className="inline-block bg-slate-200 text-slate-800 text-xs font-medium px-2 py-0.5 rounded-full">
                                                    {topic}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {q.type === 'objective' && q.options && typeof q.answerIndex === 'number' && (
                                        <>
                                            <ol className="list-[upper-alpha] list-inside pl-2 mt-2 space-y-1 text-slate-600">
                                                {q.options.map((option, index) => <li key={index} className={q.answerIndex === index ? 'font-semibold text-cyan-800' : ''}>{option}</li>)}
                                            </ol>
                                            <p className="text-sm font-bold text-slate-800 mt-2">Gabarito: {String.fromCharCode(65 + q.answerIndex)}</p>
                                        </>
                                    )}
                                </div>
                                <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-200 pt-2">
                                    <button onClick={() => handleCopyQuestion(q.stem)} className="p-1.5 text-slate-400 hover:text-cyan-600 rounded-full transition-colors" aria-label="Copiar Enunciado">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2-2H9a2 2 0 01-2-2V9z" />
                                            <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h6a2 2 0 00-2-2H5z" />
                                        </svg>
                                    </button>
                                    <button onClick={() => handleToggleFavorite(q.id)} className="p-1.5 text-slate-400 hover:text-amber-500 rounded-full transition-colors" aria-label="Favoritar">
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${q.favorited ? 'text-amber-400 fill-current' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    </button>
                                     <button onClick={() => onEditQuestion(q)} className="p-1.5 text-slate-400 hover:text-cyan-600 rounded-full transition-colors" aria-label="Editar Questão">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                                            <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    <button onClick={() => handleDeleteQuestion(q.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-full transition-colors" aria-label="Excluir Questão">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                    {totalPages > 1 && (
                        <nav className="flex items-center justify-between border-t border-slate-200 pt-4 mt-4">
                            <button 
                                onClick={() => goToPage(currentPage - 1)} 
                                disabled={currentPage === 1} 
                                className="relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Anterior
                            </button>
                            
                            <div className="hidden md:flex items-center gap-1">
                                {paginationItems.map((item, index) => {
                                    if (typeof item === 'string') {
                                        return (
                                            <span key={`ellipsis-${index}`} className="px-3 py-2 text-sm font-medium text-slate-500">
                                                {item}
                                            </span>
                                        );
                                    }
                                    return (
                                        <button
                                            key={item}
                                            onClick={() => goToPage(item)}
                                            className={`h-9 w-9 flex items-center justify-center border border-slate-300 text-sm font-medium rounded-md transition-colors ${
                                                currentPage === item
                                                    ? 'bg-cyan-600 text-white border-cyan-600 z-10'
                                                    : 'bg-white text-slate-700 hover:bg-slate-50'
                                            }`}
                                            aria-current={currentPage === item ? 'page' : undefined}
                                        >
                                            {item}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="md:hidden">
                                <p className="text-sm text-slate-700">
                                    Página <span className="font-medium">{currentPage}</span> de <span className="font-medium">{totalPages}</span>
                                </p>
                            </div>

                            <button 
                                onClick={() => goToPage(currentPage + 1)} 
                                disabled={currentPage === totalPages} 
                                className="relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Próxima
                            </button>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
};


// --- Knowledge Base View ---
interface KnowledgeBaseViewProps {
    files: KnowledgeFile[];
    setFiles: (files: KnowledgeFile[]) => void;
    showNotification: (message: string, type: 'success' | 'error') => void;
}

const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({ files, setFiles, showNotification }) => {
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = event.target.files;
        if (selectedFiles && selectedFiles.length > 0) {
            handleUpload(selectedFiles[0]);
        }
    };

    const handleUpload = async (file: File) => {
        setIsUploading(true);
        try {
            const fileContent = await fileParserService.parseFile(file);
            
            const chunks = ragService.chunkText(fileContent);
            
            const newFile: KnowledgeFileWithContent = {
                id: crypto.randomUUID(),
                name: file.name,
                isSelected: false,
                indexedChunks: chunks.map(text => ({
                    text,
                    tfIndex: calculateTf(text),
                }))
            };
            await storageService.saveFile(newFile);
            setFiles([...files, { id: newFile.id, name: newFile.name, isSelected: newFile.isSelected }]);
            showNotification(`Arquivo "${file.name}" adicionado com sucesso!`, 'success');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Erro desconhecido ao processar o arquivo.";
            showNotification(errorMessage, 'error');
            console.error(error);
        } finally {
            setIsUploading(false);
            if(fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const toggleSelectFile = (id: string) => {
        setFiles(files.map(f => f.id === id ? { ...f, isSelected: !f.isSelected } : f));
    };

    const handleDeleteFile = async (id: string, name: string) => {
        if(window.confirm(`Tem certeza que deseja excluir o arquivo "${name}"?`)) {
            await storageService.deleteFile(id);
            setFiles(files.filter(f => f.id !== id));
            showNotification(`Arquivo "${name}" excluído.`, 'success');
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg border border-slate-200">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200">
                <h2 className="text-xl font-bold text-slate-800">Base de Conhecimento (RAG)</h2>
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".pdf,.docx,.txt,.md" />
                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:bg-slate-400">
                    {isUploading ? <Spinner size="small" /> : 'Adicionar Arquivo'}
                </button>
            </div>
            {files.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                    <p>Nenhum arquivo na sua base de conhecimento.</p>
                    <p className="text-sm">Adicione arquivos (.pdf, .docx, .txt) para gerar questões baseadas em conteúdo específico.</p>
                </div>
            ) : (
                <ul className="divide-y divide-slate-200">
                    {files.map(file => (
                        <li key={file.id} className="py-3 flex items-center justify-between">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" checked={file.isSelected} onChange={() => toggleSelectFile(file.id)} className="h-5 w-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"/>
                                <span className="font-medium text-slate-700 group-hover:text-cyan-600">{file.name}</span>
                            </label>
                            <button onClick={() => handleDeleteFile(file.id, file.name)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-full transition-colors" aria-label="Excluir Arquivo">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
             <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600">
                <p><strong>Como usar:</strong> Selecione um ou mais arquivos para que a IA os utilize como contexto ao gerar novas questões. Não se esqueça de preencher o campo "Tópico/Conteúdo" no gerador.</p>
            </div>
        </div>
    );
};

// --- Exam Creator View ---
interface ExamCreatorViewProps {
    exams: Exam[];
    questions: Question[];
    setExams: (updatedExams: Exam[]) => void;
    showNotification: (message: string, type: 'success' | 'error') => void;
}

const ExamCreatorView: React.FC<ExamCreatorViewProps> = ({ exams, questions, setExams, showNotification }) => {
    const [editingExam, setEditingExam] = useState<Exam | null>(null);
    const [examName, setExamName] = useState('');
    const [questionIdsInExam, setQuestionIdsInExam] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isProcessingPdf, setIsProcessingPdf] = useState<{id: string, action: 'download' | 'share'} | null>(null);
    const [generationOptions, setGenerationOptions] = useState({
        includeOptions: true,
        includeAnswerKey: true,
    });
    const navigate = useNavigate();

    const startNewExam = () => {
        setEditingExam({ id: crypto.randomUUID(), name: '', questionIds: [], creationDate: Date.now() });
        setExamName('Nova Prova');
        setQuestionIdsInExam([]);
        setGenerationOptions({ includeOptions: true, includeAnswerKey: true });
    };

    const startEditingExam = (exam: Exam) => {
        setEditingExam(exam);
        setExamName(exam.name);
        setQuestionIdsInExam([...exam.questionIds]); // Create a new array to avoid mutation
        setGenerationOptions(exam.generationOptions || { includeOptions: true, includeAnswerKey: true });
    };
    
    const cancelEditing = () => {
        setEditingExam(null);
        setExamName('');
        setQuestionIdsInExam([]);
        setSearchTerm('');
        setGenerationOptions({ includeOptions: true, includeAnswerKey: true });
    };

    const handleSaveExam = () => {
        if (!examName.trim()) {
            showNotification('O nome da prova não pode estar vazio.', 'error');
            return;
        }
        if (!editingExam) return;

        const isNewExam = !exams.some(e => e.id === editingExam.id);
        const updatedExam: Exam = { ...editingExam, name: examName.trim(), questionIds: questionIdsInExam, generationOptions };
        
        const updatedExams = isNewExam
            ? [...exams, updatedExam]
            : exams.map(e => e.id === updatedExam.id ? updatedExam : e);

        setExams(updatedExams);
        showNotification(`Prova "${updatedExam.name}" salva com sucesso!`, 'success');
        cancelEditing();
    };

    const handleDeleteExam = (examId: string) => {
        if (window.confirm("Tem certeza que deseja excluir esta prova? Esta ação não pode ser desfeita.")) {
            const updatedExams = exams.filter(e => e.id !== examId);
            setExams(updatedExams);
            showNotification('Prova excluída com sucesso.', 'success');
        }
    };

    const handleGeneratePdf = async (examToPrint: Exam, action: 'download' | 'share') => {
        if (isProcessingPdf) return;
        setIsProcessingPdf({ id: examToPrint.id, action });

        try {
            if (typeof jspdf === 'undefined') {
                throw new Error('A biblioteca de geração de PDF (jsPDF) não foi carregada.');
            }

            const { jsPDF } = jspdf;
            const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

            const page = {
                width: doc.internal.pageSize.getWidth(),
                height: doc.internal.pageSize.getHeight(),
                margin: { top: 40, right: 40, bottom: 40, left: 40 }
            };
            const contentWidth = page.width - page.margin.left - page.margin.right;
            let y = page.margin.top;

            const addPageIfNeeded = (requiredHeight: number) => {
                if (y + requiredHeight > page.height - page.margin.bottom) {
                    doc.addPage();
                    y = page.margin.top;
                }
            };

            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            const titleLines = doc.splitTextToSize(examToPrint.name, contentWidth);
            addPageIfNeeded(titleLines.length * 20 + 20);
            doc.text(titleLines, page.width / 2, y, { align: 'center' });
            y += titleLines.length * 20 + 20;

            const answerKey: { question: number; answer: string }[] = [];
            const examQuestions = examToPrint.questionIds
                .map(id => questions.find(q => q.id === id))
                .filter((q): q is Question => !!q);

            examQuestions.forEach((q, index) => {
                const questionNumber = index + 1;
                const questionHeader = `Questão ${questionNumber}:`;
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');

                const stemLines = doc.splitTextToSize(q.stem, contentWidth);
                let optionsHeight = 0;
                if (q.type === 'objective' && examToPrint.generationOptions?.includeOptions && q.options) {
                    q.options.forEach(opt => {
                        optionsHeight += doc.splitTextToSize(opt, contentWidth - 20).length * 14 + 5;
                    });
                }
                const estimatedHeight = 20 + (stemLines.length * 14) + optionsHeight + 15;
                addPageIfNeeded(estimatedHeight);

                doc.text(questionHeader, page.margin.left, y);
                y += 20;

                doc.setFontSize(11);
                doc.setFont('helvetica', 'normal');
                doc.text(stemLines, page.margin.left, y, { maxWidth: contentWidth });
                y += stemLines.length * 14;

                if (q.type === 'objective' && examToPrint.generationOptions?.includeOptions && q.options) {
                    y += 5;
                    q.options.forEach((option, optIndex) => {
                        const optionLabel = `${String.fromCharCode(65 + optIndex)}) `;
                        const optionLines = doc.splitTextToSize(option, contentWidth - 20);
                        addPageIfNeeded((optionLines.length * 14) + 5);
                        doc.text(optionLabel, page.margin.left, y);
                        doc.text(optionLines, page.margin.left + 20, y, { maxWidth: contentWidth - 20 });
                        y += (optionLines.length * 14) + 5;
                    });
                    if (typeof q.answerIndex === 'number') {
                        answerKey.push({ question: questionNumber, answer: String.fromCharCode(65 + q.answerIndex) });
                    }
                } else {
                    answerKey.push({ question: questionNumber, answer: 'Resposta dissertativa' });
                }
                y += 15;
            });

            if (examToPrint.generationOptions?.includeAnswerKey && answerKey.length > 0) {
                addPageIfNeeded(page.height); 
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.text('Gabarito', page.margin.left, y);
                y += 30;
                doc.setFontSize(11);
                doc.setFont('helvetica', 'normal');
                answerKey.forEach(item => {
                    const answerText = `Questão ${item.question}: ${item.answer}`;
                    addPageIfNeeded(20);
                    doc.text(answerText, page.margin.left, y);
                    y += 20;
                });
            }
            
            if (action === 'download') {
                doc.save(`${examToPrint.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
                showNotification('PDF gerado com sucesso!', 'success');
            } else if (action === 'share') {
                const pdfBlob = doc.output('blob');
                const pdfFile = new File([pdfBlob], `${examToPrint.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`, { type: 'application/pdf' });
                
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                    await navigator.share({
                        files: [pdfFile],
                        title: examToPrint.name,
                        text: `Prova gerada pelo ENEM Genius: ${examToPrint.name}`
                    });
                    showNotification('Prova compartilhada!', 'success');
                } else {
                    throw new Error('O compartilhamento de arquivos não é suportado neste navegador.');
                }
            }

        } catch (error) {
            console.error("Falha ao processar PDF:", error);
            const errorMessage = error instanceof Error ? error.message : "Ocorreu um erro desconhecido.";
            showNotification(`Falha ao processar o PDF: ${errorMessage}`, 'error');
        } finally {
            setIsProcessingPdf(null);
        }
    };
    
    const addQuestionToExam = (questionId: string) => {
        if (!questionIdsInExam.includes(questionId)) {
            setQuestionIdsInExam([...questionIdsInExam, questionId]);
        }
    };

    const removeQuestionFromExam = (questionId: string) => {
        setQuestionIdsInExam(questionIdsInExam.filter(id => id !== questionId));
    };

    const availableQuestions = useMemo(() => {
        const lowercasedSearchTerm = searchTerm.toLowerCase();
        return questions.filter(q => 
            !questionIdsInExam.includes(q.id) && 
            (q.stem.toLowerCase().includes(lowercasedSearchTerm) || q.discipline.toLowerCase().includes(lowercasedSearchTerm))
        );
    }, [questions, questionIdsInExam, searchTerm]);

    const questionsInCurrentExam = useMemo(() => {
        return questionIdsInExam
            .map(id => questions.find(q => q.id === id))
            .filter((q): q is Question => !!q);
    }, [questionIdsInExam, questions]);
    
    if (editingExam) {
        return (
            <div className="bg-white p-4 sm:p-6 rounded-lg border border-slate-200 pb-24 lg:pb-6">
                {/* Header: Name input and Top Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 pb-4 border-b border-slate-200">
                    <input
                        type="text"
                        value={examName}
                        onChange={(e) => setExamName(e.target.value)}
                        placeholder="Nome da Prova"
                        className="text-xl font-bold text-slate-800 focus:ring-cyan-500 focus:border-cyan-500 block w-full sm:w-1/2 shadow-sm sm:text-lg border-slate-300 rounded-md"
                    />
                     <div className="hidden sm:flex items-center gap-2">
                        <button onClick={cancelEditing} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md">Cancelar</button>
                        <button onClick={handleSaveExam} className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-md shadow-sm">Salvar Prova</button>
                    </div>
                </div>

                <fieldset className="mb-6 mt-2 p-4 border border-slate-200 rounded-md">
                    <legend className="text-md font-semibold text-slate-800 px-2">Opções de Geração do PDF</legend>
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 pt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={generationOptions.includeOptions}
                                onChange={(e) => setGenerationOptions(prev => ({ ...prev, includeOptions: e.target.checked }))}
                                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                            />
                            <span className="text-sm font-medium text-slate-700">Incluir Alternativas</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={generationOptions.includeAnswerKey}
                                onChange={(e) => setGenerationOptions(prev => ({ ...prev, includeAnswerKey: e.target.checked }))}
                                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                            />
                            <span className="text-sm font-medium text-slate-700">Incluir Gabarito</span>
                        </label>
                    </div>
                </fieldset>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Questions in Exam */}
                    <div className="space-y-3 flex flex-col">
                        <h3 className="font-semibold text-slate-700">Questões na Prova ({questionsInCurrentExam.length})</h3>
                        <div className="border border-slate-200 rounded-md p-2 flex-grow max-h-64 sm:max-h-96 overflow-y-auto custom-scrollbar space-y-2">
                           {questionsInCurrentExam.length > 0 ? questionsInCurrentExam.map(q => (
                               <div key={q.id} className="p-2.5 bg-slate-50 rounded-md flex justify-between items-center gap-2">
                                   <p className="text-sm text-slate-700 font-medium flex-1 truncate" title={q.stem}>{q.stem}</p>
                                   <button onClick={() => removeQuestionFromExam(q.id)} className="p-1.5 text-red-500 hover:bg-red-100 rounded-full flex-shrink-0" aria-label="Remover questão">
                                       <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                                   </button>
                               </div>
                           )) : (
                               <div className="flex items-center justify-center h-full">
                                   <p className="text-sm text-slate-400 text-center p-4">Comece a adicionar questões do banco ao lado (ou abaixo em telas menores).</p>
                               </div>
                           )}
                        </div>
                    </div>

                    {/* Available Questions */}
                    <div className="space-y-3 flex flex-col">
                        <h3 className="font-semibold text-slate-700">Questões Disponíveis ({availableQuestions.length})</h3>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por enunciado ou disciplina..."
                            className="focus:ring-cyan-500 focus:border-cyan-500 block w-full shadow-sm sm:text-sm border-slate-300 rounded-md"
                        />
                        <div className="border border-slate-200 rounded-md p-2 flex-grow max-h-64 sm:max-h-96 overflow-y-auto custom-scrollbar space-y-2">
                            {availableQuestions.length > 0 ? availableQuestions.map(q => (
                               <div key={q.id} className="p-2.5 bg-white rounded-md flex justify-between items-center gap-2 hover:bg-slate-50 transition-colors duration-150">
                                   <div className="flex-1 min-w-0">
                                       <p className="text-sm text-slate-700 font-medium truncate" title={q.stem}>{q.stem}</p>
                                       <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{q.discipline}</span>
                                   </div>
                                   <button onClick={() => addQuestionToExam(q.id)} className="p-1.5 text-green-500 hover:bg-green-100 rounded-full flex-shrink-0" aria-label="Adicionar questão">
                                       <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
                                   </button>
                               </div>
                           )) : (
                                <div className="flex items-center justify-center h-full">
                                   <p className="text-sm text-slate-400 text-center p-4">Nenhuma questão disponível com este filtro.</p>
                               </div>
                           )}
                        </div>
                    </div>
                </div>

                {/* Sticky Footer for Mobile */}
                <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-slate-200 p-3 flex items-center justify-end gap-3 lg:hidden z-20">
                    <button onClick={cancelEditing} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md w-1/2">Cancelar</button>
                    <button onClick={handleSaveExam} className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-md shadow-sm w-1/2">Salvar Prova</button>
                </div>
            </div>
        );
    }
    
    return (
        <div className="bg-white p-6 rounded-lg border border-slate-200 min-h-[400px]">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200">
                <h2 className="text-xl font-bold text-slate-800">Minhas Provas</h2>
                <button onClick={startNewExam} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500">
                    Criar Nova Prova
                </button>
            </div>
            {exams.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                    <p>Nenhuma prova criada ainda.</p>
                    <p className="text-sm">Clique em "Criar Nova Prova" para começar.</p>
                </div>
            ) : (
                <ul className="divide-y divide-slate-200">
                    {exams.map(exam => {
                        const isAnyProcessing = isProcessingPdf?.id === exam.id;
                        const isSharing = isAnyProcessing && isProcessingPdf?.action === 'share';
                        const isDownloading = isAnyProcessing && isProcessingPdf?.action === 'download';
                        
                        return (
                            <li key={exam.id} className="py-3 px-2 -mx-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50/75 rounded-lg transition-colors duration-150">
                                <div onClick={() => navigate(`/exams/${exam.id}`)} className="flex-grow cursor-pointer">
                                    <p className="font-medium text-slate-800">{exam.name}</p>
                                    <p className="text-sm text-slate-500">{exam.questionIds.length} {exam.questionIds.length === 1 ? 'questão' : 'questões'} &bull; {formatDate(exam.creationDate)}</p>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:flex sm:w-auto mt-3 sm:mt-0">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleGeneratePdf(exam, 'share'); }}
                                        disabled={isAnyProcessing}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-full transition-colors disabled:opacity-50"
                                        aria-label={`Compartilhar prova ${exam.name}`}
                                    >
                                        {isSharing ? <Spinner size="small" /> : (
                                            <>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                  <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                                                </svg>
                                                <span>Compartilhar</span>
                                            </>
                                        )}
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleGeneratePdf(exam, 'download'); }} 
                                        disabled={isAnyProcessing}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors disabled:opacity-50"
                                        aria-label={`Gerar PDF da prova ${exam.name}`}
                                    >
                                        {isDownloading ? <Spinner size="small" /> : (
                                            <>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 8a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                                </svg>
                                                <span>PDF</span>
                                            </>
                                        )}
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); startEditingExam(exam); }}
                                        disabled={isAnyProcessing} 
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-700 bg-cyan-100 hover:bg-cyan-200 rounded-full transition-colors disabled:opacity-50"
                                        aria-label={`Editar prova ${exam.name}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                          <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                                          <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                        </svg>
                                        <span>Editar</span>
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteExam(exam.id); }}
                                        disabled={isAnyProcessing} 
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-full transition-colors disabled:opacity-50"
                                        aria-label={`Excluir prova ${exam.name}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                        </svg>
                                        <span>Excluir</span>
                                    </button>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    );
};

// --- Exam Detail View ---
interface ExamDetailViewProps {
    exams: Exam[];
    questions: Question[];
    setQuestions: (updatedQuestions: Question[]) => void;
    showNotification: (message: string, type: 'success' | 'error') => void;
}

const ExamDetailView: React.FC<ExamDetailViewProps> = ({ exams, questions, setQuestions, showNotification }) => {
    const { examId } = useParams<{ examId: string }>();
    const [questionToEdit, setQuestionToEdit] = useState<Question | null>(null);

    const exam = useMemo(() => exams.find(e => e.id === examId), [exams, examId]);
    const examQuestions = useMemo(() => {
        if (!exam) return [];
        return exam.questionIds
            .map(id => questions.find(q => q.id === id))
            .filter((q): q is Question => !!q);
    }, [exam, questions]);

    const handleSaveQuestionUpdate = (updatedQuestion: Question) => {
        const updatedQuestions = questions.map(q =>
            q.id === updatedQuestion.id ? updatedQuestion : q
        );
        setQuestions(updatedQuestions);
        setQuestionToEdit(null);
        showNotification("Questão atualizada com sucesso!", 'success');
    };

    if (!exam) {
        return (
            <div className="text-center p-8 bg-white rounded-lg border">
                <h2 className="text-xl font-bold text-red-600">Prova não encontrada</h2>
                <p className="text-slate-500 mt-2">A prova que você está procurando não existe ou foi excluída.</p>
                <Link to="/exams" className="mt-4 inline-block px-4 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700">
                    Voltar para a lista de provas
                </Link>
            </div>
        );
    }

    return (
        <>
            <div className="bg-white p-6 rounded-lg border border-slate-200">
                <div className="mb-6 pb-4 border-b border-slate-200">
                    <Link to="/exams" className="text-sm text-cyan-600 hover:underline flex items-center gap-1 mb-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        Voltar para Provas
                    </Link>
                    <h2 className="text-2xl font-bold text-slate-800">{exam.name}</h2>
                    <p className="text-slate-500">{examQuestions.length} {examQuestions.length === 1 ? 'questão' : 'questões'}</p>
                </div>

                {examQuestions.length > 0 ? (
                    <ul className="space-y-6">
                        {examQuestions.map((q, index) => (
                            <li key={q.id} className="bg-slate-50 p-4 rounded-md border border-slate-200">
                                <p className="font-bold text-slate-600 mb-2">Questão {index + 1}</p>
                                <p className="text-slate-800 font-medium whitespace-pre-wrap">{q.stem}</p>
                                {q.type === 'objective' && q.options && typeof q.answerIndex === 'number' && (
                                    <>
                                        <ol className="list-[upper-alpha] list-inside pl-2 mt-3 space-y-1 text-slate-600">
                                            {q.options.map((option, optIndex) => <li key={optIndex} className={q.answerIndex === optIndex ? 'font-semibold text-cyan-800' : ''}>{option}</li>)}
                                        </ol>
                                        <p className="text-sm font-bold text-slate-800 mt-2">Gabarito: {String.fromCharCode(65 + q.answerIndex)}</p>
                                    </>
                                )}
                                {q.type === 'subjective' && q.expectedAnswer && (
                                    <div className="mt-3 p-3 bg-slate-100 border-l-4 border-slate-300">
                                        <p className="text-sm font-semibold text-slate-700">Resposta Esperada:</p>
                                        <p className="text-slate-600 text-sm whitespace-pre-wrap mt-1">{q.expectedAnswer}</p>
                                    </div>
                                )}
                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={() => setQuestionToEdit(q)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-700 bg-cyan-100 hover:bg-cyan-200 rounded-full transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                                        Editar Questão
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-center py-10 text-slate-500">
                        <p>Esta prova ainda não tem questões.</p>
                        <p className="text-sm">Edite a prova para adicionar questões do seu banco.</p>
                    </div>
                )}
            </div>

            <EditQuestionModal
                isOpen={!!questionToEdit}
                onClose={() => setQuestionToEdit(null)}
                question={questionToEdit}
                onSave={handleSaveQuestionUpdate}
                showNotification={showNotification}
            />
        </>
    );
};


// --- Edit Question Modal ---
interface EditQuestionModalProps {
    isOpen: boolean;
    onClose: () => void;
    question: Question | null;
    onSave: (updatedQuestion: Question) => void;
    showNotification: (message: string, type: 'success' | 'error') => void;
}

const EditQuestionModal: React.FC<EditQuestionModalProps> = ({ isOpen, onClose, question, onSave, showNotification }) => {
    const [editedQuestion, setEditedQuestion] = useState<Question | null>(null);
    const [showIaModification, setShowIaModification] = useState(false);
    const [iaInstruction, setIaInstruction] = useState('');
    const [isModifying, setIsModifying] = useState(false);
    const [topicInput, setTopicInput] = useState('');

    useEffect(() => {
        if (question) {
            const questionCopy = JSON.parse(JSON.stringify(question));
            if (!questionCopy.topics) {
                questionCopy.topics = []; // Ensure topics array exists for older questions
            }
            setEditedQuestion(questionCopy);
            setShowIaModification(false);
            setIaInstruction('');
        } else {
            setEditedQuestion(null);
        }
    }, [question]);

    const handleIaModify = async () => {
        if (!iaInstruction.trim() || !editedQuestion) {
            showNotification('Por favor, insira uma instrução para a IA.', 'error');
            return;
        }
        setIsModifying(true);
        try {
            const originalQuestionPayload: any = {
                stem: editedQuestion.stem,
                discipline: editedQuestion.discipline,
                difficulty: editedQuestion.difficulty,
                constructionType: editedQuestion.constructionType,
                bloomLevel: editedQuestion.bloomLevel,
                topics: editedQuestion.topics,
            };

            let formatInstruction = '';
            if (editedQuestion.type === 'objective') {
                originalQuestionPayload.options = editedQuestion.options;
                originalQuestionPayload.answerIndex = editedQuestion.answerIndex;
                formatInstruction = `{ "stem": "...", "options": ["...", "...", "...", "...", "..."], "answerIndex": 0, "topics": ["..."] }`;
            } else {
                originalQuestionPayload.expectedAnswer = editedQuestion.expectedAnswer;
                formatInstruction = `{ "stem": "...", "expectedAnswer": "...", "topics": ["..."] }`;
            }

            const prompt = `
                Aja como um especialista em elaboração de questões. Sua tarefa é modificar uma questão existente com base na instrução fornecida pelo usuário.

                A questão original é:
                ${JSON.stringify(originalQuestionPayload, null, 2)}

                A instrução de modificação é:
                "${iaInstruction}"

                REGRAS OBRIGATÓRIAS:
                1. Modifique a questão original (enunciado, alternativas, gabarito, tópicos) para atender à instrução.
                2. Mantenha a mesma estrutura de dados da questão original.
                3. Sua resposta DEVE ser um objeto JSON VÁLIDO, e NADA MAIS.
                4. NÃO inclua explicações, texto introdutório, ou blocos de código markdown como \`\`\`json.
                5. O objeto JSON de saída deve ter a seguinte estrutura: ${formatInstruction}
            `;

            const responseText = await apiService.generate(prompt);
            const modifiedData = JSON.parse(responseText);

            setEditedQuestion(prev => {
                if (!prev) return null;
                // Merge the new data with old data, preserving id, type, etc.
                return {
                    ...prev,
                    stem: modifiedData.stem || prev.stem,
                    options: modifiedData.options || prev.options,
                    answerIndex: (typeof modifiedData.answerIndex === 'number') ? modifiedData.answerIndex : prev.answerIndex,
                    expectedAnswer: modifiedData.expectedAnswer !== undefined ? modifiedData.expectedAnswer : prev.expectedAnswer,
                    topics: modifiedData.topics || prev.topics,
                };
            });
            showNotification('Questão modificada pela IA. Verifique as alterações e salve.', 'success');
            setShowIaModification(false); // Hide after successful generation
            setIaInstruction('');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "A resposta da IA está em um formato inválido.";
            showNotification(`Erro ao modificar com IA: ${errorMessage}`, 'error');
            console.error("IA Modification Error:", error);
        } finally {
            setIsModifying(false);
        }
    };


    if (!isOpen || !editedQuestion) return null;

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        const { name, value } = e.target;
        setEditedQuestion(prev => prev ? { ...prev, [name]: value } : null);
    };
    
    const handleOptionChange = (index: number, value: string) => {
        setEditedQuestion(prev => {
            if (!prev || !prev.options) return prev;
            const newOptions = [...prev.options];
            newOptions[index] = value;
            return { ...prev, options: newOptions };
        });
    };

    const handleDropdownChange = (field: keyof Question, value: string) => {
        setEditedQuestion(prev => prev ? { ...prev, [field]: value } : null);
    };

    const handleSave = () => {
        if (editedQuestion) {
            onSave(editedQuestion);
        }
    };
    
    const addTopic = (topic: string) => {
        setEditedQuestion(prev => {
            if (!prev) return null;
            const existingTopics = prev.topics || [];
            if (!existingTopics.map(t => t.toLowerCase()).includes(topic.toLowerCase())) {
                return { ...prev, topics: [...existingTopics, topic] };
            }
            return prev;
        });
        setTopicInput('');
    };

    const removeTopic = (indexToRemove: number) => {
        setEditedQuestion(prev => {
            if (!prev || !prev.topics) return prev;
            return {
                ...prev,
                topics: prev.topics.filter((_, index) => index !== indexToRemove),
            };
        });
    };

    const handleTopicKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const newTopic = topicInput.trim();
            if (newTopic) {
                addTopic(newTopic);
            }
        } else if (e.key === 'Backspace' && topicInput === '' && editedQuestion.topics && editedQuestion.topics.length > 0) {
            removeTopic(editedQuestion.topics.length - 1);
        }
    };


    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-[100] flex items-center justify-center p-4 transition-opacity duration-300" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                    <h3 className="text-lg font-bold text-slate-800">Editar Questão</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>
                <main className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                    <div>
                        <label htmlFor="stem" className="block text-sm font-medium text-slate-700 mb-1">Enunciado</label>
                        <textarea id="stem" name="stem" value={editedQuestion.stem} onChange={handleInputChange} rows={6} className="focus:ring-cyan-500 focus:border-cyan-500 block w-full shadow-sm sm:text-sm border-slate-300 rounded-md" />
                    </div>

                    {editedQuestion.type === 'objective' && editedQuestion.options && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Alternativas (Marque a correta)</label>
                            <div className="space-y-3">
                                {editedQuestion.options.map((option, index) => (
                                    <div key={index} className="flex items-center gap-3">
                                        <input
                                            type="radio"
                                            name="answerIndex"
                                            checked={editedQuestion.answerIndex === index}
                                            onChange={() => setEditedQuestion(prev => prev ? { ...prev, answerIndex: index } : null)}
                                            className="h-4 w-4 text-cyan-600 border-slate-300 focus:ring-cyan-500"
                                        />
                                        <input
                                            type="text"
                                            value={option}
                                            onChange={(e) => handleOptionChange(index, e.target.value)}
                                            className="focus:ring-cyan-500 focus:border-cyan-500 block w-full shadow-sm sm:text-sm border-slate-300 rounded-md"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {editedQuestion.type === 'subjective' && (
                         <div>
                            <label htmlFor="expectedAnswer" className="block text-sm font-medium text-slate-700 mb-1">Resposta Esperada</label>
                            <textarea id="expectedAnswer" name="expectedAnswer" value={editedQuestion.expectedAnswer || ''} onChange={handleInputChange} rows={4} className="focus:ring-cyan-500 focus:border-cyan-500 block w-full shadow-sm sm:text-sm border-slate-300 rounded-md" />
                        </div>
                    )}
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tópicos (Tags)</label>
                        <div className="flex flex-wrap items-center gap-2 p-2 border border-slate-300 rounded-md focus-within:ring-1 focus-within:ring-cyan-500 focus-within:border-cyan-500">
                            {editedQuestion.topics?.map((topic, index) => (
                                <span key={index} className="flex items-center gap-1.5 bg-cyan-100 text-cyan-800 text-sm font-medium px-2 py-1 rounded-md">
                                    {topic}
                                    <button
                                        type="button"
                                        onClick={() => removeTopic(index)}
                                        className="text-cyan-600 hover:text-cyan-900 font-bold"
                                        aria-label={`Remover tópico ${topic}`}
                                    >
                                        &times;
                                    </button>
                                </span>
                            ))}
                            <input
                                type="text"
                                value={topicInput}
                                onChange={(e) => setTopicInput(e.target.value)}
                                onKeyDown={handleTopicKeyDown}
                                placeholder="Adicionar tópico..."
                                className="flex-grow bg-transparent border-none focus:ring-0 p-1 text-sm"
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Pressione Enter ou vírgula para adicionar um tópico.</p>
                    </div>

                    {showIaModification && (
                        <div className="p-4 bg-cyan-50/50 border border-cyan-200 rounded-md space-y-3 transition-all">
                            <h4 className="font-semibold text-slate-700 flex items-center gap-2">
                                ✨ Modificar com IA
                                <InfoTooltip text="Descreva como você quer que a IA modifique a questão acima. Ela irá reescrever o enunciado, as alternativas e o gabarito." />
                            </h4>
                            <textarea 
                                value={iaInstruction}
                                onChange={e => setIaInstruction(e.target.value)}
                                placeholder="Ex: Deixe o enunciado mais curto, mude a questão para o tema de biologia, troque o gabarito para a alternativa C, etc."
                                rows={3}
                                className="focus:ring-cyan-500 focus:border-cyan-500 block w-full shadow-sm sm:text-sm border-slate-300 rounded-md"
                            />
                            <div className="flex items-center justify-end">
                                 <button onClick={handleIaModify} className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-md shadow-sm w-36" disabled={isModifying}>
                                     {isModifying ? <Spinner size="small" /> : 'Gerar Modificação'}
                                 </button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                         <CustomDropdown 
                            id="edit-discipline"
                            label="Disciplina"
                            options={ALL_DISCIPLINES}
                            selectedValue={editedQuestion.discipline}
                            onSelect={(value) => handleDropdownChange('discipline', value)}
                         />
                         <CustomDropdown 
                            id="edit-school-year"
                            label="Ano Escolar"
                            options={SCHOOL_YEARS}
                            selectedValue={editedQuestion.schoolYear}
                            onSelect={(value) => handleDropdownChange('schoolYear', value)}
                         />
                         <CustomDropdown 
                            id="edit-difficulty"
                            label="Dificuldade"
                            options={DIFFICULTY_LEVELS}
                            selectedValue={editedQuestion.difficulty}
                            onSelect={(value) => handleDropdownChange('difficulty', value)}
                         />
                         <CustomDropdown 
                            id="edit-construction"
                            label="Tipo de Construção"
                            options={CONSTRUCTION_TYPES}
                            selectedValue={editedQuestion.constructionType}
                            onSelect={(value) => handleDropdownChange('constructionType', value)}
                         />
                    </div>
                </main>
                <footer className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-3 flex-shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-md">Cancelar</button>
                    <button onClick={() => setShowIaModification(!showIaModification)} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${showIaModification ? 'bg-cyan-100 text-cyan-800' : 'bg-transparent text-cyan-700 hover:bg-cyan-50'}`}>
                        ✨ Assim mas...
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-md shadow-sm">Salvar Alterações</button>
                </footer>
            </div>
        </div>
    );
};


// --- Main App Component ---

type View = 'generator' | 'bank' | 'exams' | 'knowledge';

const AppContent: React.FC = () => {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [exams, setExams] = useState<Exam[]>([]);
    const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
    const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const location = useLocation();

    const showNotification = (message: string, type: 'success' | 'error') => {
        setNotification({ message, type });
    };

    const handleSetQuestions = useCallback((updatedQuestions: Question[]) => {
        setQuestions(updatedQuestions);
        storageService.saveQuestions(updatedQuestions);
    }, []);

    useEffect(() => {
        const loadData = async () => {
            await storageService.init();
            
            const loadedQuestions = storageService.getQuestions();
            let needsQuestionUpdate = false;
            const questionsWithDate = loadedQuestions.map((q, index) => {
                if (!q.creationDate) {
                    needsQuestionUpdate = true;
                    return { ...q, creationDate: Date.now() - (index * 60000) };
                }
                return q;
            });
    
            if (needsQuestionUpdate) {
                handleSetQuestions(questionsWithDate);
            } else {
                setQuestions(loadedQuestions);
            }
    
            const loadedExams = storageService.getExams();
            let needsExamUpdate = false;
            const examsWithDate = loadedExams.map((e, index) => {
                if (!e.creationDate) {
                    needsExamUpdate = true;
                    return { ...e, creationDate: Date.now() - (index * 60000) };
                }
                return e;
            });
    
            if (needsExamUpdate) {
                handleSetExams(examsWithDate);
            } else {
                setExams(loadedExams);
            }

            const filesMeta = await storageService.getAllFilesMeta();
            const storedFiles = JSON.parse(localStorage.getItem('enem_genius_knowledge_files_selection') || '[]');
            const syncedFiles = filesMeta.map(fm => {
                const storedFile = storedFiles.find((sf: KnowledgeFile) => sf.id === fm.id);
                return storedFile ? storedFile : fm;
            });

            setKnowledgeFiles(syncedFiles);
        };
        loadData();
    }, [handleSetQuestions]);

    const handleSetExams = useCallback((updatedExams: Exam[]) => {
        setExams(updatedExams);
        storageService.saveExams(updatedExams);
    }, []);

    const handleSetKnowledgeFiles = useCallback((updatedFiles: KnowledgeFile[]) => {
        setKnowledgeFiles(updatedFiles);
        localStorage.setItem('enem_genius_knowledge_files_selection', JSON.stringify(updatedFiles));
    }, []);

    const addQuestion = useCallback((question: Question) => {
        const updatedQuestions = [question, ...questions];
        handleSetQuestions(updatedQuestions);
    }, [questions, handleSetQuestions]);

    const handleEditQuestion = (question: Question) => {
        setEditingQuestion(question);
    };

    const handleUpdateQuestion = (updatedQuestion: Question) => {
        const updatedQuestions = questions.map(q =>
            q.id === updatedQuestion.id ? updatedQuestion : q
        );
        handleSetQuestions(updatedQuestions);
        setEditingQuestion(null); // Close the modal
        showNotification("Questão atualizada com sucesso!", 'success');
    };

    const navItems: { id: View; label: string; icon: React.ReactElement }[] = [
        { id: 'generator', label: 'Gerador', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg> },
        { id: 'bank', label: 'Banco de Questões', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" /><path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" /></svg> },
        { id: 'exams', label: 'Criador de Provas', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg> },
        { id: 'knowledge', label: 'Base de Conhecimento', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 16c1.255 0 2.443-.29 3.5-.804V4.804zM14.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 0114.5 16c1.255 0 2.443-.29 3.5-.804v-10A7.968 7.968 0 0014.5 4z" /></svg> },
    ];

    const Sidebar = () => (
        <aside className={`fixed top-0 left-0 z-50 w-64 h-screen bg-slate-800 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform duration-300 ease-in-out`}>
            <div className="flex items-center justify-center p-4 border-b border-slate-700">
                 <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    💡 ENEM Genius
                </h1>
            </div>
            <nav className="mt-4">
                {navItems.map((item) => (
                    <NavLink
                        key={item.id}
                        to={`/${item.id}`}
                        onClick={() => setIsSidebarOpen(false)}
                        className={({ isActive }) =>
                            `w-full flex items-center gap-3 px-4 py-3 text-left font-medium transition-colors ${
                                isActive
                                    ? 'bg-cyan-600 text-white'
                                    : 'text-slate-200 hover:bg-slate-700 hover:text-white'
                            }`
                        }
                        aria-current={({isActive}) => isActive ? 'page' : undefined}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>
            <div className="absolute bottom-0 w-full p-4 text-center">
                <a 
                    href="https://wa.me/5584999780963" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                    Produzido por Danilo Arruda
                </a>
            </div>
        </aside>
    );

    const currentPath = location.pathname.split('/')[1] as View;

    return (
        <div className="min-h-screen bg-slate-100 text-slate-800">
            {notification && <Notification message={notification.message} type={notification.type} onDismiss={() => setNotification(null)} />}
            
            <EditQuestionModal 
                isOpen={!!editingQuestion}
                onClose={() => setEditingQuestion(null)}
                question={editingQuestion}
                onSave={handleUpdateQuestion}
                showNotification={showNotification}
            />
            
            <InfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} />

            <Sidebar />

            {isSidebarOpen && (
                <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"></div>
            )}
            
            <div className="lg:ml-64 transition-all duration-300 ease-in-out relative">
                <div className="absolute top-4 right-4 sm:top-6 sm:right-6 lg:top-8 lg:right-8 z-30">
                    <button
                        onClick={() => setIsInfoModalOpen(true)}
                        className="h-10 w-10 bg-white rounded-full shadow-md flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-cyan-600 transition-colors"
                        aria-label="Informações sobre o aplicativo"
                    >
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                       </svg>
                    </button>
                </div>

                <header className="bg-white shadow-sm sticky top-0 z-20 lg:hidden">
                     <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between h-16">
                            <button
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                className="text-slate-500 hover:text-slate-800"
                                aria-label="Open sidebar"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                            <h1 className="text-xl font-bold text-slate-800">
                                {navItems.find(item => item.id === currentPath)?.label}
                            </h1>
                            <div className="w-6"></div>
                        </div>
                    </div>
                </header>
                <main className="container mx-auto p-4 sm:p-6 lg:p-8">
                   <Routes>
                        <Route path="/" element={<Navigate replace to="/generator" />} />
                        <Route path="/generator" element={<QuestionGeneratorView addQuestion={addQuestion} showNotification={showNotification} knowledgeFiles={knowledgeFiles} onEditQuestion={handleEditQuestion} />} />
                        <Route path="/bank" element={<QuestionBankView questions={questions} setQuestions={handleSetQuestions} showNotification={showNotification} onEditQuestion={handleEditQuestion} />} />
                        <Route path="/exams" element={<ExamCreatorView exams={exams} setExams={handleSetExams} questions={questions} showNotification={showNotification} />} />
                        <Route path="/exams/:examId" element={<ExamDetailView exams={exams} questions={questions} setQuestions={handleSetQuestions} showNotification={showNotification} />} />
                        <Route path="/knowledge" element={<KnowledgeBaseView files={knowledgeFiles} setFiles={handleSetKnowledgeFiles} showNotification={showNotification} />} />
                   </Routes>
                </main>
            </div>
        </div>
    );
};

const App: React.FC = () => (
    <HashRouter>
        <AppContent />
    </HashRouter>
);

export default App;