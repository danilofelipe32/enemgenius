import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Question, Exam, KnowledgeFile, KnowledgeFileWithContent } from './types';
import { storageService, apiService, fileParserService } from './services';
import { ALL_DISCIPLINES, DISCIPLINE_TO_AREA_MAP, KNOWLEDGE_AREAS } from './constants';

// --- Global Declarations ---
declare const jspdf: any;

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
    const baseClasses = 'fixed top-5 right-5 z-50 p-4 rounded-lg shadow-lg text-sm font-semibold transition-opacity duration-300';
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

// --- Custom Dropdown Component ---
interface CustomDropdownProps {
    id: string;
    label: string;
    options: string[];
    selectedValue: string;
    onSelect: (value: string) => void;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({ id, label, options, selectedValue, onSelect }) => {
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
            <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
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


// --- Question Generator View ---

const BLOOM_LEVELS = ['Lembrar', 'Entender', 'Aplicar', 'Analisar', 'Avaliar', 'Criar'];
const CONSTRUCTION_TYPES = [
    "Interpretação", "Cálculo", "Associação de ideias", "Asserção/razão (adaptado)",
    "Interdisciplinaridade", "Atualidades/contexto social", "Experimentos", "Textos culturais/literários",
];
const DIFFICULTY_LEVELS = ['Fácil', 'Médio', 'Difícil'];
const DIFFICULTY_TO_BLOOM_MAP: { [key: string]: string[] } = {
  'Fácil': ['Lembrar', 'Entender'],
  'Médio': ['Aplicar', 'Analisar'],
  'Difícil': ['Avaliar', 'Criar'],
};

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
    const [bloomLevel, setBloomLevel] = useState(DIFFICULTY_TO_BLOOM_MAP[DIFFICULTY_LEVELS[1]][0]); // Default 'Aplicar'
    const [constructionType, setConstructionType] = useState(CONSTRUCTION_TYPES[0]);
    const [numQuestions, setNumQuestions] = useState(3);
    const [topic, setTopic] = useState('');
    const [questionType, setQuestionType] = useState<'objective' | 'subjective'>('objective');

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
        const possibleBloomLevels = DIFFICULTY_TO_BLOOM_MAP[newDifficulty];
        const randomBloomLevel = possibleBloomLevels[Math.floor(Math.random() * possibleBloomLevels.length)];
        setBloomLevel(randomBloomLevel);
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

            const commonPromptPart = `
                - Nível de Ensino (Série/Ano): ${schoolYear}
                - Área de Conhecimento: ${selectedArea}
                - Disciplina: ${selectedDiscipline}
                - Nível de Dificuldade: ${difficulty}
                - Nível da Taxonomia de Bloom (referência): ${bloomLevel}
                - Tipo de Construção: ${constructionType}
                - Tópico Específico: ${topic || 'Conhecimentos gerais da disciplina'}
            `;

            let specialInstruction = '';
            if (constructionType === 'Interpretação') {
                specialInstruction = `
                    INSTRUÇÃO ESPECIAL PARA 'INTERPRETAção':
                    Para questões que exijam um suporte (texto, gráfico, imagem, tabela, charge), o enunciado ('stem') DEVE começar com esse suporte.
                    1. Se for um texto, inclua-o integralmente entre aspas.
                    2. Se for um elemento VISUAL (gráfico, imagem, etc.), NÃO CRIE A IMAGEM. Em vez disso, descreva-a de forma rica e detalhada para que uma IA de imagem possa gerá-la. Formate a descrição assim: [DESCRIÇÃO PARA GERAR IMAGEM: Um gráfico de pizza mostrando a distribuição de fontes de energia no Brasil em 2023. A maior fatia é hidrelétrica com 60%, seguida por eólica com 15%...].
                    Após o suporte (texto ou descrição), apresente o comando da questão.
                `;
            } else {
                specialInstruction = `
                    INSTRUÇÃO ESPECIAL DE CONTEXTO:
                    O enunciado ('stem') de cada questão DEVE, obrigatoriamente, conter um texto de apoio ou um contexto de tamanho médio. A questão não deve ser direta, mas sim baseada na análise do contexto apresentado.
                `;
            }
            
            const jsonFormatInstruction = `
                Sua resposta DEVE ser um array JSON válido, sem nenhum texto introdutório, final ou explicações.
                NÃO envolva o JSON em blocos de código markdown como \`\`\`json.
                A resposta deve ser APENAS o array de objetos JSON.
                O array deve conter exatamente ${numQuestions} objeto(s).
                A estrutura de cada objeto no array deve ser:
            ` + (questionType === 'objective'
                ? `{ "stem": "O enunciado completo da questão aqui.", "options": ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D", "Alternativa E"], "answerIndex": 0, "discipline": "${selectedDiscipline}", "bloomLevel": "${bloomLevel}", "constructionType": "${constructionType}", "difficulty": "${difficulty}" }`
                : `{ "stem": "O enunciado completo da questão aqui.", "expectedAnswer": "A resposta dissertativa completa aqui.", "discipline": "${selectedDiscipline}", "bloomLevel": "${bloomLevel}", "constructionType": "${constructionType}", "difficulty": "${difficulty}" }`
            );

            const prompt = `
                Aja como um especialista em elaboração de questões para o ENEM. Crie ${numQuestions} questão(ões) ${questionType === 'objective' ? 'de múltipla escolha (A, B, C, D, E)' : 'SUBJETIVAS (dissertativas)'} sobre o seguinte tópico:
                ${commonPromptPart}
                ${context ? `Utilize o seguinte texto como base de conhecimento para criar as questões (o texto foi selecionado por relevância ao tópico):\n---\n${context}\n---` : ''}
                ${specialInstruction}
                REGRAS DE FORMATAÇÃO DA SAÍDA:
                ${jsonFormatInstruction}
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
                type: questionType,
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
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Questão</label>
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
                                        <CustomDropdown id="discipline" label="Disciplina" options={ALL_DISCIPLINES} selectedValue={selectedDiscipline} onSelect={handleDisciplineChange} />
                                        <p className="mt-1 text-xs text-slate-500">
                                            Área: <span className="font-semibold">{selectedArea}</span>
                                        </p>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <CustomDropdown id="schoolYear" label="Série/Ano" options={SCHOOL_YEARS} selectedValue={schoolYear} onSelect={setSchoolYear} />
                                    </div>
                                    <CustomDropdown id="difficulty" label="Nível de Dificuldade" options={DIFFICULTY_LEVELS} selectedValue={difficulty} onSelect={handleDifficultyChange} />
                                    <CustomDropdown id="construction" label="Tipo de Construção" options={CONSTRUCTION_TYPES} selectedValue={constructionType} onSelect={setConstructionType} />
                                </div>
                            </div>
                        </fieldset>
                        <fieldset>
                            <legend className="text-lg font-semibold text-slate-800 mb-4">Conteúdo Específico</legend>
                            <div className="space-y-4">
                                 <div>
                                    <label htmlFor="numQuestions" className="block text-sm font-medium text-slate-700">Número de Questões (1-10)</label>
                                    <input type="number" id="numQuestions" value={numQuestions} onChange={e => setNumQuestions(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))} min="1" max="10" className="mt-1 focus:ring-cyan-500 focus:border-cyan-500 block w-full shadow-sm sm:text-sm border-slate-300 rounded-md" />
                                </div>
                                <div>
                                    <label htmlFor="topic" className="block text-sm font-medium text-slate-700">Tópico/Conteúdo (Obrigatório com arquivo)</label>
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

const QuestionBankView: React.FC<QuestionBankViewProps> = ({ questions, setQuestions, showNotification, onEditQuestion }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [filterDiscipline, setFilterDiscipline] = useState('Todas');
    const [filterBloom, setFilterBloom] = useState('Todos');
    const [filterFavorited, setFilterFavorited] = useState(false);

    const filteredQuestions = useMemo(() => {
        return questions.filter(q => {
            const disciplineMatch = filterDiscipline === 'Todas' || q.discipline === filterDiscipline;
            const bloomMatch = filterBloom === 'Todos' || q.bloomLevel === filterBloom;
            const favoritedMatch = !filterFavorited || q.favorited;
            return disciplineMatch && bloomMatch && favoritedMatch;
        }).sort((a, b) => b.favorited === a.favorited ? 0 : b.favorited ? 1 : -1);
    }, [questions, filterDiscipline, filterBloom, filterFavorited]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterDiscipline, filterBloom, filterFavorited]);

    const totalPages = Math.ceil(filteredQuestions.length / QUESTIONS_PER_PAGE);
    const startIndex = (currentPage - 1) * QUESTIONS_PER_PAGE;
    const currentQuestions = filteredQuestions.slice(startIndex, startIndex + QUESTIONS_PER_PAGE);

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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 pb-6 border-b border-slate-200">
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

            {filteredQuestions.length === 0 ? (
                <div className="text-center text-slate-500 py-8">
                     <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                     <p className="mt-4 font-semibold">Nenhuma questão encontrada.</p>
                     <p className="text-sm">Tente ajustar os filtros ou adicione mais questões ao banco.</p>
                </div>
            ) : (
                <>
                    <ul className="divide-y divide-slate-200">
                        {currentQuestions.map(q => (
                            <li key={q.id} className="py-4 group">
                                <div className="cursor-pointer" onClick={() => onEditQuestion(q)}>
                                     <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <span className="inline-block bg-sky-100 text-sky-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{DISCIPLINE_TO_AREA_MAP[q.discipline] || 'N/A'}</span>
                                        <span className="inline-block bg-teal-100 text-teal-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{q.discipline}</span>
                                        <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{q.difficulty}</span>
                                        <span className="inline-block bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{q.constructionType}</span>
                                        {q.type === 'subjective' && (
                                             <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Subjetiva</span>
                                        )}
                                    </div>
                                    <p className="text-slate-800 font-medium whitespace-pre-wrap group-hover:text-cyan-700">{q.stem}</p>
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
                                            <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
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
                        <nav className="flex items-center justify-between border-t border-slate-200 px-4 sm:px-0 pt-4 mt-4">
                             <div className="w-0 flex-1 flex">
                                <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                                    Anterior
                                </button>
                            </div>
                            <div className="hidden md:flex">
                                <p className="text-sm text-slate-700">Página <span className="font-medium">{currentPage}</span> de <span className="font-medium">{totalPages}</span></p>
                            </div>
                            <div className="w-0 flex-1 flex justify-end">
                                <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="ml-3 relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                                    Próxima
                                </button>
                            </div>
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
            
            const chunks = [];
            const chunkSize = 1500;
            const overlap = 200;
            for (let i = 0; i < fileContent.length; i += (chunkSize - overlap)) {
                chunks.push(fileContent.substring(i, i + chunkSize));
            }
            
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
    const [generationOptions, setGenerationOptions] = useState({
        includeOptions: true,
        includeAnswerKey: true,
    });

    const startNewExam = () => {
        setEditingExam({ id: crypto.randomUUID(), name: '', questionIds: [] });
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

    const handleGeneratePdf = (examToPrint: Exam) => {
        if (typeof jspdf === 'undefined') {
            showNotification('A biblioteca de geração de PDF não foi carregada.', 'error');
            return;
        }

        const { jsPDF } = jspdf;
        const doc = new jsPDF();

        // Sanitize HTML content
        const sanitize = (text: string) => {
            const element = document.createElement('div');
            element.innerText = text;
            return element.innerHTML;
        };

        let htmlContent = `
            <style>
                body { font-family: 'Helvetica', 'sans-serif'; line-height: 1.6; color: #333; }
                h1 { text-align: center; margin-bottom: 20px; font-size: 24px; color: #000; }
                .question { margin-bottom: 20px; page-break-inside: avoid; }
                .question-header { font-weight: bold; margin-bottom: 8px; }
                .stem { margin-bottom: 8px; white-space: pre-wrap; word-wrap: break-word; }
                .options { list-style-type: upper-alpha; padding-left: 25px; margin: 0; }
                .options li { margin-bottom: 5px; }
                .answer-key { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px; page-break-before: always; }
                h2 { font-size: 20px; color: #000; }
                .answer-key ol { list-style-type: none; padding-left: 0; }
                .answer-key li { margin-bottom: 5px; }
            </style>
            <h1>${sanitize(examToPrint.name)}</h1>
        `;

        const examQuestions = examToPrint.questionIds
            .map(id => questions.find(q => q.id === id))
            .filter((q): q is Question => !!q);
        
        examQuestions.forEach((q, index) => {
            htmlContent += `
                <div class="question">
                    <p class="question-header">Questão ${index + 1}:</p>
                    <div class="stem">${sanitize(q.stem)}</div>
            `;
            if (q.type === 'objective' && examToPrint.generationOptions?.includeOptions && q.options) {
                htmlContent += '<ol class="options">';
                q.options.forEach(opt => {
                    htmlContent += `<li>${sanitize(opt)}</li>`;
                });
                htmlContent += '</ol>';
            }
            htmlContent += '</div>';
        });

        if (examToPrint.generationOptions?.includeAnswerKey) {
            htmlContent += `<div class="answer-key"><h2>Gabarito</h2><ol>`;
            examQuestions.forEach((q, index) => {
                let answer = 'Resposta dissertativa';
                if (q.type === 'objective' && typeof q.answerIndex === 'number') {
                    answer = String.fromCharCode(65 + q.answerIndex);
                }
                htmlContent += `<li><strong>Questão ${index + 1}:</strong> ${answer}</li>`;
            });
            htmlContent += `</ol></div>`;
        }

        doc.html(htmlContent, {
            callback: function (doc: any) {
                doc.save(`${examToPrint.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
                showNotification('PDF gerado com sucesso!', 'success');
            },
            x: 15,
            y: 15,
            width: 180,
            windowWidth: 800
        });
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
                    {exams.map(exam => (
                        <li key={exam.id} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 group">
                            <div onClick={() => startEditingExam(exam)} className="flex-grow cursor-pointer">
                                <p className="font-medium text-slate-800 group-hover:text-cyan-700 transition-colors">{exam.name}</p>
                                <p className="text-sm text-slate-500">{exam.questionIds.length} {exam.questionIds.length === 1 ? 'questão' : 'questões'}</p>
                            </div>
                             <div className="flex items-center gap-2 self-start sm:self-center flex-shrink-0 mt-2 sm:mt-0">
                                <button onClick={(e) => { e.stopPropagation(); handleGeneratePdf(exam); }} className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">Gerar PDF</button>
                                <button onClick={(e) => { e.stopPropagation(); startEditingExam(exam); }} className="px-3 py-1.5 text-xs font-semibold text-cyan-700 bg-cyan-100 hover:bg-cyan-200 rounded-full transition-colors">Editar</button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteExam(exam.id); }} className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-full transition-colors">Excluir</button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// --- TODO: Edit Question View (Modal) ---
const EditQuestionView = () => {
     return null; // A ser implementado
}


// --- Main App Component ---

type View = 'generator' | 'bank' | 'exams' | 'knowledge';

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<View>('generator');
    const [questions, setQuestions] = useState<Question[]>([]);
    const [exams, setExams] = useState<Exam[]>([]);
    const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
    const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        const loadData = async () => {
            await storageService.init();
            setQuestions(storageService.getQuestions());
            setExams(storageService.getExams());
            const filesMeta = await storageService.getAllFilesMeta();
            // This syncs the isSelected state from localStorage (if any) to the loaded files
            const storedFiles = JSON.parse(localStorage.getItem('enem_genius_knowledge_files_selection') || '[]');
            const syncedFiles = filesMeta.map(fm => {
                const storedFile = storedFiles.find((sf: KnowledgeFile) => sf.id === fm.id);
                return storedFile ? storedFile : fm;
            });

            setKnowledgeFiles(syncedFiles);
        };
        loadData();
    }, []);

    const showNotification = (message: string, type: 'success' | 'error') => {
        setNotification({ message, type });
    };

    const handleSetQuestions = useCallback((updatedQuestions: Question[]) => {
        setQuestions(updatedQuestions);
        storageService.saveQuestions(updatedQuestions);
    }, []);

    const handleSetExams = useCallback((updatedExams: Exam[]) => {
        setExams(updatedExams);
        storageService.saveExams(updatedExams);
    }, []);

    const handleSetKnowledgeFiles = useCallback((updatedFiles: KnowledgeFile[]) => {
        setKnowledgeFiles(updatedFiles);
        // Persist only metadata, including selection state, to localStorage for quick access
        localStorage.setItem('enem_genius_knowledge_files_selection', JSON.stringify(updatedFiles));
    }, []);


    const addQuestion = useCallback((question: Question) => {
        const updatedQuestions = [question, ...questions];
        handleSetQuestions(updatedQuestions);
    }, [questions, handleSetQuestions]);

    const handleEditQuestion = (question: Question) => {
        // TODO: Open edit modal
        alert(`Editando questão: ${question.stem.substring(0, 50)}... (Funcionalidade de edição a ser implementada)`);
        // setEditingQuestion(question);
    };
    
    const handleSetView = (view: View) => {
        setCurrentView(view);
        setIsSidebarOpen(false);
    }

    const navItems: { id: View; label: string; icon: React.ReactElement }[] = [
        { id: 'generator', label: 'Gerador', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg> },
        { id: 'bank', label: 'Banco de Questões', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" /><path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" /></svg> },
        { id: 'exams', label: 'Criador de Provas', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg> },
        { id: 'knowledge', label: 'Base de Conhecimento', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 16c1.255 0 2.443-.29 3.5-.804V4.804zM14.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 0114.5 16c1.255 0 2.443-.29 3.5-.804v-10A7.968 7.968 0 0014.5 4z" /></svg> },
    ];

    const renderView = () => {
        switch (currentView) {
            case 'generator':
                return <QuestionGeneratorView addQuestion={addQuestion} showNotification={showNotification} knowledgeFiles={knowledgeFiles} onEditQuestion={handleEditQuestion} />;
            case 'bank':
                return <QuestionBankView questions={questions} setQuestions={handleSetQuestions} showNotification={showNotification} onEditQuestion={handleEditQuestion} />;
            case 'exams':
                return <ExamCreatorView exams={exams} setExams={handleSetExams} questions={questions} showNotification={showNotification} />;
            case 'knowledge':
                return <KnowledgeBaseView files={knowledgeFiles} setFiles={handleSetKnowledgeFiles} showNotification={showNotification} />;
            default:
                return null;
        }
    };
    
    const Sidebar = () => (
        <aside className={`fixed top-0 left-0 z-50 w-64 h-screen bg-slate-800 text-slate-200 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform duration-300 ease-in-out`}>
            <div className="flex items-center justify-center p-4 border-b border-slate-700">
                 <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    💡 ENEM Genius
                </h1>
            </div>
            <nav className="mt-4">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => handleSetView(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left font-medium transition-colors ${
                            currentView === item.id
                                ? 'bg-cyan-600 text-white'
                                : 'hover:bg-slate-700 hover:text-white'
                        }`}
                        aria-current={currentView === item.id ? 'page' : undefined}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>
        </aside>
    );

    return (
        <div className="min-h-screen bg-slate-100 text-slate-800">
            {notification && <Notification message={notification.message} type={notification.type} onDismiss={() => setNotification(null)} />}
            
            <Sidebar />

            {isSidebarOpen && (
                <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"></div>
            )}
            
            <div className="lg:ml-64 transition-all duration-300 ease-in-out">
                <header className="bg-white shadow-sm sticky top-0 z-30 lg:hidden">
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
                                {navItems.find(item => item.id === currentView)?.label}
                            </h1>
                             {/* Placeholder for potential header actions */}
                            <div className="w-6"></div>
                        </div>
                    </div>
                </header>
                <main className="container mx-auto p-4 sm:p-6 lg:p-8">
                    {renderView()}
                </main>
            </div>
        </div>
    );
};

export default App;
