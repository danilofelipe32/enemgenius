
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

// --- Helper for Bloom Colors ---
const getBloomColorClass = (level: string) => {
    switch (level) {
        case 'Lembrar': return 'bg-gray-100 text-gray-700 border-gray-200';
        case 'Entender': return 'bg-blue-50 text-blue-700 border-blue-200';
        case 'Aplicar': return 'bg-green-50 text-green-700 border-green-200';
        case 'Analisar': return 'bg-amber-50 text-amber-800 border-amber-200';
        case 'Avaliar': return 'bg-orange-50 text-orange-700 border-orange-200';
        case 'Criar': return 'bg-rose-50 text-rose-700 border-rose-200';
        default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
};

const getBloomChipStyle = (level: string, isSelected: boolean) => {
    if (!isSelected) {
        return 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300';
    }
    
    switch (level) {
        case 'Lembrar': return 'bg-gray-100 text-gray-800 border-gray-300 ring-1 ring-gray-300 shadow-sm';
        case 'Entender': return 'bg-blue-100 text-blue-800 border-blue-300 ring-1 ring-blue-300 shadow-sm';
        case 'Aplicar': return 'bg-green-100 text-green-800 border-green-300 ring-1 ring-green-300 shadow-sm';
        case 'Analisar': return 'bg-amber-100 text-amber-800 border-amber-300 ring-1 ring-amber-300 shadow-sm';
        case 'Avaliar': return 'bg-orange-100 text-orange-800 border-orange-300 ring-1 ring-orange-300 shadow-sm';
        case 'Criar': return 'bg-rose-100 text-rose-800 border-rose-300 ring-1 ring-rose-300 shadow-sm';
        default: return 'bg-slate-100 text-slate-800 border-slate-300';
    }
};

// --- UI Components ---

const Spinner: React.FC<{ size?: 'small' | 'large' }> = ({ size = 'large' }) => {
    const sizeClasses = size === 'large' ? 'w-10 h-10 border-4' : 'w-5 h-5 border-2';
    return <div className={`animate-spin rounded-full border-slate-200 border-t-indigo-600 ${sizeClasses}`}></div>;
};

const Notification: React.FC<{ message: string; type: 'success' | 'error'; onDismiss: () => void }> = ({ message, type, onDismiss }) => {
    const baseClasses = 'fixed top-6 right-6 z-[200] p-4 rounded-xl shadow-xl backdrop-blur-md text-sm font-semibold transition-all duration-300 animate-slide-in flex items-center gap-3';
    const typeClasses = type === 'success' 
        ? 'bg-green-100/90 text-green-800 border border-green-200' 
        : 'bg-red-100/90 text-red-800 border border-red-200';

    useEffect(() => {
        const timer = setTimeout(onDismiss, 5000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div className={`${baseClasses} ${typeClasses}`}>
            {type === 'success' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
            <span>{message}</span>
            <button onClick={onDismiss} className="ml-2 hover:opacity-70 p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
    );
};

const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
    return (
        <div className="relative group inline-block ml-1 align-middle">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 cursor-help hover:text-indigo-500 transition-colors" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-max max-w-xs bg-slate-800 text-white text-xs rounded-lg py-2 px-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-50 shadow-xl">
                {text}
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-800"></div>
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
            <div className="flex items-center gap-1.5 mb-1.5">
                 <label htmlFor={id} className="block text-sm font-semibold text-slate-700">{label}</label>
                 {tooltip && <InfoTooltip text={tooltip} />}
            </div>
            <button
                type="button"
                id={id}
                onClick={() => setIsOpen(!isOpen)}
                className={`flex w-full items-center justify-between rounded-xl bg-slate-50 py-3 pl-4 pr-3 text-left shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm ${isOpen ? 'ring-2 ring-indigo-500' : 'hover:bg-slate-100'}`}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <span className="block truncate font-medium text-slate-700">{selectedValue}</span>
                <span className="pointer-events-none text-slate-400">
                     <svg className={`h-5 w-5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-500' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                </span>
            </button>
            {isOpen && (
                <ul
                    className="absolute z-20 mt-2 max-h-60 w-full overflow-auto rounded-xl bg-white py-1 text-base shadow-2xl ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm animate-fade-in"
                    tabIndex={-1}
                    role="listbox"
                >
                    {options.map(option => (
                        <li
                            key={option}
                            onClick={() => handleSelect(option)}
                            className={`relative cursor-pointer select-none py-3 px-4 transition-colors ${
                                selectedValue === option ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                           <span className={`block truncate ${selectedValue === option ? 'font-bold' : 'font-normal'}`}>
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
    // Gradient: from Indigo to Cyan
    const gradientStyle = {
        background: `linear-gradient(to right, #818cf8, #06b6d4 ${percentage}%, #e2e8f0 ${percentage}%)`
    };

    return (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                    <label htmlFor={id} className="block text-sm font-semibold text-slate-700">{label}</label>
                    {tooltip && <InfoTooltip text={tooltip} />}
                </div>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md min-w-[3rem] text-center">{value.toFixed(2)}</span>
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
                className="w-full h-2 rounded-lg appearance-none cursor-pointer range-slider focus:outline-none focus:ring-2 focus:ring-indigo-500/50 rounded-full"
            />
             <div className="flex justify-between text-xs text-slate-400 mt-2 font-medium">
                <span>Conservador</span>
                <span>Criativo</span>
            </div>
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 transition-all duration-300" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col transform transition-all scale-100" onClick={e => e.stopPropagation()}>
                <header className="p-5 border-b border-slate-100 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">Explicação da IA</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>
                <main className="p-6 overflow-y-auto custom-scrollbar">
                    <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                       <p className="text-slate-800 font-medium whitespace-pre-wrap leading-relaxed">{question.stem}</p>
                       {question.type === 'objective' && question.options && typeof question.answerIndex === 'number' && (
                           <div className="mt-3 space-y-2">
                               {question.options.map((option, index) => (
                                   <div key={index} className={`flex gap-3 text-sm ${question.answerIndex === index ? 'text-green-700 font-semibold' : 'text-slate-500'}`}>
                                       <span className="uppercase w-5">{String.fromCharCode(65 + index)}.</span>
                                       <span>{option}</span>
                                       {question.answerIndex === index && <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>}
                                   </div>
                               ))}
                           </div>
                       )}
                    </div>
                    
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                            <Spinner />
                            <p className="mt-4 font-bold text-lg text-slate-700">Analisando questão...</p>
                            <p className="text-sm">A IA está gerando uma explicação detalhada.</p>
                        </div>
                    )}
                    
                    {error && (
                        <div className="text-red-700 bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                            <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <div>
                                <p className="font-bold">Erro ao Gerar Explicação</p>
                                <p className="text-sm mt-1">{error}</p>
                            </div>
                        </div>
                    )}
                    
                    {!isLoading && !error && explanation && (
                        <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed">
                            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                                {explanation}
                            </div>
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 transition-all" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="bg-gradient-to-r from-indigo-600 to-cyan-600 p-6 text-white flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                            <span className="text-2xl">💡</span>
                        </div>
                        <h3 className="text-2xl font-bold">ENEM Genius</h3>
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-full transition-colors">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                <main className="p-8 overflow-y-auto custom-scrollbar space-y-6">
                    <p className="text-lg text-slate-600 leading-relaxed">
                        Uma plataforma inteligente (PWA) projetada para revolucionar a preparação para o ENEM, utilizando IA avançada para criar questões pedagógicas baseadas na <strong>Taxonomia de Bloom</strong>.
                    </p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-colors">
                            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Gerador IA
                            </h4>
                            <p className="text-sm text-slate-500">Crie questões personalizadas com controle total de dificuldade e competências.</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-colors">
                            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-cyan-500"></span> Banco de Itens
                            </h4>
                            <p className="text-sm text-slate-500">Gerencie seu repositório pessoal, edite e organize questões.</p>
                        </div>
                         <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-colors">
                            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Montador de Provas
                            </h4>
                            <p className="text-sm text-slate-500">Selecione itens e exporte provas completas em PDF diagramado.</p>
                        </div>
                         <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-colors">
                            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Contexto RAG
                            </h4>
                            <p className="text-sm text-slate-500">Faça upload de textos e apostilas para a IA gerar questões baseadas no seu material.</p>
                        </div>
                    </div>

                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-800 flex items-start gap-3">
                        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p>Os dados são armazenados localmente no seu dispositivo para máxima privacidade.</p>
                    </div>
                </main>
                <footer className="p-6 bg-slate-50 border-t border-slate-100 text-center flex-shrink-0">
                    <p className="text-sm text-slate-500">
                        Desenvolvido com ❤️ por <a href="https://wa.me/5584999780963" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 hover:underline">Danilo Arruda</a>
                    </p>
                </footer>
            </div>
        </div>
    );
};

// --- PDF Preview Modal ---
const PdfPreviewModal: React.FC<{ isOpen: boolean; onClose: () => void; pdfUrl: string | null; title: string }> = ({ isOpen, onClose, pdfUrl, title }) => {
    if (!isOpen || !pdfUrl) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4 transition-all animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <header className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V6.414A2 2 0 0016.414 5L14 2.586A2 2 0 0012.586 2H9z" /><path d="M3 8a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                        Pré-visualização: {title}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>
                <div className="flex-1 bg-slate-100 p-4 overflow-hidden">
                    <iframe src={pdfUrl} className="w-full h-full rounded-lg shadow-inner border border-slate-300" title="PDF Preview" />
                </div>
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
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

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

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setIsUploading(true);
        setError(null);

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const text = await fileParserService.parseFile(file);
                const chunks = ragService.chunkText(text);
                
                const indexedChunks = chunks.map(chunk => ({
                    text: chunk,
                    tfIndex: calculateTf(chunk)
                }));

                const newFile: KnowledgeFileWithContent = {
                    id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: file.name,
                    isSelected: true,
                    indexedChunks
                };

                await storageService.saveFile(newFile);
            }
            await fetchFiles();
        } catch (err: any) {
            setError(`Erro ao carregar arquivo: ${err.message}`);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleToggleFileSelection = async (id: string) => {
        const file = await storageService.getFile(id);
        if (file) {
            file.isSelected = !file.isSelected;
            await storageService.saveFile(file);
            fetchFiles();
        }
    };

    const handleDeleteFile = async (id: string) => {
        if(window.confirm('Tem certeza que deseja remover este arquivo da base de conhecimento?')) {
            await storageService.deleteFile(id);
            fetchFiles();
        }
    };

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

                **3. Contexto Adicional (RAG):**
                ${context ? `Use o seguinte contexto como base principal para as questões:\n--- INÍCIO DO CONTEXTO ---\n${context}\n--- FIM DO CONTEXTO ---` : 'Nenhum arquivo de contexto foi selecionado. Baseie-se no conhecimento geral da disciplina.'}
                
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
            navigate('/bank');

        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro desconhecido.');
        } finally {
            setIsLoading(false);
        }
    }, [
        numQuestions, questionType, discipline, schoolYear, difficulty, bloomLevel,
        constructionType, topics, onQuestionsGenerated, getContextFromSelectedFiles,
        temperature, useWebSearch, navigate
    ]);

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <header className="mb-6 md:mb-8">
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">Gerador de Questões</h2>
                <p className="text-slate-500 mt-2 text-sm md:text-base">Defina os parâmetros abaixo e deixe a IA criar itens alinhados à matriz do ENEM.</p>
            </header>

            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-white/20 backdrop-blur-sm space-y-6 md:space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    
                    {/* Basic Controls */}
                    <div className="space-y-6">
                        <h3 className="text-xs md:text-sm font-bold uppercase tracking-wider text-slate-400 mb-2 md:mb-4">Configurações Básicas</h3>
                        
                        <div>
                            <label htmlFor="numQuestions" className="block text-sm font-semibold text-slate-700 mb-1.5">Quantidade</label>
                            <input
                                type="number"
                                id="numQuestions"
                                value={numQuestions}
                                onChange={e => setNumQuestions(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                className="block w-full rounded-xl bg-slate-50 border-0 py-3 px-4 text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-base sm:text-sm sm:leading-6 transition-all"
                                min="1" max="10"
                            />
                        </div>

                         <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo de Questão</label>
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                                <button 
                                    onClick={() => setQuestionType('objective')} 
                                    className={`flex-1 py-3 md:py-2 text-sm font-semibold rounded-lg transition-all shadow-sm ${questionType === 'objective' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Objetiva
                                </button>
                                <button 
                                    onClick={() => setQuestionType('subjective')} 
                                    className={`flex-1 py-3 md:py-2 text-sm font-semibold rounded-lg transition-all shadow-sm ${questionType === 'subjective' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Dissertativa
                                </button>
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
                    </div>

                    {/* Pedagogical Controls */}
                    <div className="space-y-6">
                        <h3 className="text-xs md:text-sm font-bold uppercase tracking-wider text-slate-400 mb-2 md:mb-4">Parâmetros Pedagógicos</h3>

                         <CustomDropdown
                            id="difficulty"
                            label="Dificuldade"
                            options={DIFFICULTY_LEVELS}
                            selectedValue={difficulty}
                            onSelect={setDifficulty}
                        />

                        {/* Bloom Level Chips */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-1.5">
                                 <label className="block text-sm font-semibold text-slate-700">Nível de Bloom</label>
                                 <InfoTooltip text="Define a complexidade cognitiva da questão." />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {BLOOM_LEVELS.map(level => (
                                    <button
                                        key={level}
                                        onClick={() => setBloomLevel(level)}
                                        className={`px-3 py-2 rounded-lg text-sm font-bold transition-all border ${getBloomChipStyle(level, bloomLevel === level)} flex-grow md:flex-grow-0 justify-center`}
                                    >
                                        {level}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <CustomDropdown
                            id="constructionType"
                            label="Tipo de Construção"
                            options={CONSTRUCTION_TYPES}
                            selectedValue={constructionType}
                            onSelect={setConstructionType}
                            tooltip="Abordagem estrutural da questão."
                        />
                    </div>
                </div>

                {/* RAG Section */}
                <div className="border-t border-slate-100 pt-6">
                    <h3 className="text-xs md:text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                        Base de Conhecimento (RAG) <InfoTooltip text="Envie arquivos para a IA usar como contexto específico." />
                    </h3>
                    
                    <div className="space-y-4">
                        <div className={`border-2 border-dashed rounded-2xl p-6 transition-colors text-center ${isUploading ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}>
                            <input 
                                type="file" 
                                multiple 
                                accept=".pdf,.docx,.txt,.md" 
                                onChange={handleFileUpload} 
                                className="hidden" 
                                id="file-upload"
                                ref={fileInputRef}
                                disabled={isUploading}
                            />
                            <label htmlFor="file-upload" className="cursor-pointer block">
                                {isUploading ? (
                                    <div className="flex flex-col items-center justify-center text-indigo-600">
                                        <Spinner size="small" />
                                        <span className="mt-2 text-sm font-semibold">Processando arquivos...</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="mx-auto w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 mb-2">
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                        </div>
                                        <span className="text-sm font-semibold text-slate-700">Clique para enviar arquivos</span>
                                        <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT, MD</p>
                                    </>
                                )}
                            </label>
                        </div>

                        {knowledgeFiles.length > 0 && (
                            <div className="grid gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                                {knowledgeFiles.map(file => (
                                    <div key={file.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <input 
                                                type="checkbox" 
                                                checked={file.isSelected} 
                                                onChange={() => handleToggleFileSelection(file.id)}
                                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm font-medium text-slate-700 truncate">{file.name}</span>
                                        </div>
                                        <button onClick={() => handleDeleteFile(file.id)} className="text-slate-400 hover:text-red-500 p-1">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t border-slate-100 pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-4">
                        <TemperatureSlider
                            id="temperature"
                            label="Criatividade da IA"
                            value={temperature}
                            onChange={e => setTemperature(parseFloat(e.target.value))}
                            tooltip="Ajusta a variabilidade das respostas."
                        />
                        
                         <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer hover:border-indigo-200 transition-colors" onClick={() => setUseWebSearch(!useWebSearch)}>
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${useWebSearch ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9V3m-9 9h18" />
                                    </svg>
                                </div>
                                <div>
                                    <span className="block font-semibold text-slate-700">Pesquisa Web</span>
                                    <span className="text-xs text-slate-500">Usar dados em tempo real</span>
                                </div>
                            </div>
                            <div className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${useWebSearch ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${useWebSearch ? 'translate-x-5' : 'translate-x-0'}`}></div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="topics" className="block text-sm font-semibold text-slate-700 mb-1.5">Tópicos e Conteúdos</label>
                        <textarea
                            id="topics"
                            value={topics}
                            onChange={e => setTopics(e.target.value)}
                            placeholder="Ex: Revolução Industrial, Análise Combinatória (separe por vírgulas)"
                            rows={4}
                            className="block w-full rounded-xl bg-slate-50 border-0 py-3 px-4 text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-base sm:text-sm sm:leading-6 transition-all resize-none"
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-end pb-4 md:pb-0">
                <button
                    onClick={handleGenerateQuestions}
                    disabled={isLoading}
                    className="w-full md:w-auto group relative inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-8 py-4 text-base font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:shadow-indigo-500/50 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                >
                    {isLoading ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Criando Questões...
                        </>
                    ) : (
                        <>
                            Gerar Questões
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </>
                    )}
                </button>
            </div>
            {error && (
                <div className="rounded-xl bg-red-50 p-4 border border-red-200 animate-shake">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-red-800">Erro na geração</h3>
                            <div className="mt-2 text-sm text-red-700">
                                <p>{error}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
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
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-white/20 backdrop-blur-sm animate-fade-in">
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Editando Questão
                </h3>
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Enunciado</label>
                        <textarea
                            value={editingQuestion.stem}
                            onChange={(e) => setEditingQuestion({ ...editingQuestion, stem: e.target.value })}
                            rows={6}
                            className="block w-full rounded-xl bg-slate-50 border-0 py-3 px-4 text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                     {editingQuestion.type === 'objective' && editingQuestion.options?.map((option, index) => (
                        <div key={index}>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Alternativa {String.fromCharCode(65 + index)}</label>
                            <input
                                type="text"
                                value={option}
                                onChange={(e) => {
                                    const newOptions = [...editingQuestion.options!];
                                    newOptions[index] = e.target.value;
                                    setEditingQuestion({ ...editingQuestion, options: newOptions });
                                }}
                                className="block w-full rounded-xl bg-slate-50 border-0 py-2 px-4 text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm"
                            />
                        </div>
                    ))}
                    <div className="flex justify-end gap-3 pt-4 flex-col sm:flex-row">
                        <button onClick={() => setEditingQuestion(null)} className="w-full sm:w-auto px-5 py-3 sm:py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                        <button onClick={handleSaveEdit} className="w-full sm:w-auto px-5 py-3 sm:py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all">Salvar Alterações</button>
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            <header className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                     <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">Banco de Questões</h2>
                     <p className="text-slate-500 mt-2 text-sm md:text-base">Gerencie, filtre e estude com seu repositório pessoal de itens.</p>
                </div>
            </header>

            <div className="bg-white p-4 rounded-2xl shadow-lg border border-slate-100 flex flex-col md:flex-row gap-4 items-center sticky top-0 z-10 backdrop-blur-md bg-white/90">
                <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Pesquisar..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full rounded-xl bg-slate-50 border-0 py-3 md:py-2.5 pl-10 pr-4 text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-500 text-base sm:text-sm"
                    />
                </div>
                <button
                    onClick={() => setShowFavorites(!showFavorites)}
                    className={`w-full md:w-auto flex justify-center items-center gap-2 px-5 py-3 md:py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all shadow-sm ${showFavorites ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${showFavorites ? 'text-amber-500 fill-current' : 'text-slate-400'}`} viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    {showFavorites ? 'Favoritas' : 'Todas'}
                </button>
            </div>
            
             <div className="space-y-6">
                {filteredQuestions.length > 0 ? (
                    filteredQuestions.map(q => (
                        <div key={q.id} className="bg-white p-6 md:p-8 rounded-3xl shadow-lg shadow-slate-200/50 border border-white transition-all hover:shadow-xl hover:-translate-y-1 hover:border-indigo-100 group relative">
                            
                            {/* Header Section */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                <div className="flex flex-wrap gap-2">
                                     <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider border border-slate-200">{q.discipline}</span>
                                     <span className={`text-xs font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider border ${getBloomColorClass(q.bloomLevel)}`}>{q.bloomLevel}</span>
                                </div>
                                
                                <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity justify-end">
                                    <button 
                                        onClick={() => onToggleFavorite(q.id)} 
                                        className={`p-2.5 rounded-xl transition-all ${q.favorited ? 'bg-amber-100 text-amber-500 shadow-sm' : 'bg-slate-50 text-slate-400 hover:bg-amber-50 hover:text-amber-400'}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    </button>
                                    <button 
                                        onClick={() => setEditingQuestion(q)} 
                                        className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                                    </button>
                                    <button 
                                        onClick={() => onDelete(q.id)} 
                                        className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    </button>
                                </div>
                            </div>

                            {/* Content Section */}
                            <div className="mb-8">
                                <p className="text-slate-700 text-lg leading-loose whitespace-pre-wrap font-serif antialiased">{q.stem}</p>
                            </div>

                            {/* Options Section */}
                            {q.type === 'objective' && q.options && (
                                <div className="grid gap-3 mb-8">
                                    {q.options.map((option, index) => (
                                        <div key={index} className={`flex items-start gap-4 p-4 rounded-2xl border transition-all ${q.answerIndex === index ? 'bg-green-50 border-green-200 shadow-sm' : 'bg-slate-50 border-transparent hover:bg-white hover:border-slate-200'}`}>
                                                <span className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold shadow-sm ${q.answerIndex === index ? 'bg-green-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                                                {String.fromCharCode(65 + index)}
                                                </span>
                                                <span className={`text-base leading-relaxed ${q.answerIndex === index ? 'font-medium text-green-900' : 'text-slate-600'}`}>{option}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {q.type === 'subjective' && q.expectedAnswer && (
                                <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 mb-8">
                                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3">Resposta Esperada</p>
                                    <p className="text-slate-700 text-base leading-relaxed">{q.expectedAnswer}</p>
                                </div>
                            )}

                            {/* Footer Section */}
                            <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                                <div className="hidden sm:block text-xs text-slate-400 font-medium">
                                    Criada em {formatDate(q.creationDate)}
                                </div>
                                <button onClick={() => handleExplainQuestion(q)} className="w-full sm:w-auto group flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all border border-indigo-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform group-hover:scale-110" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                    </svg>
                                    Explicação IA
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300">
                         <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-50 text-slate-300 mb-6">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">Nada por aqui ainda</h3>
                        <p className="text-slate-500 mt-2 max-w-sm mx-auto px-4">Seu banco de questões está vazio ou nenhum item corresponde à sua busca.</p>
                        <button onClick={() => setFilter('')} className="mt-6 px-6 py-2.5 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">
                            Limpar filtros
                        </button>
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
    const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
    const [examName, setExamName] = useState('');
    const [viewingExam, setViewingExam] = useState<Exam | null>(null);
    const [filter, setFilter] = useState('');
    const [filteredQuestions, setFilteredQuestions] = useState(questions);
    
    // Preview States
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

     useEffect(() => {
        setFilteredQuestions(
            questions.filter(q =>
                (q.stem.toLowerCase().includes(filter.toLowerCase()) ||
                 q.discipline.toLowerCase().includes(filter.toLowerCase()))
            ).sort((a, b) => b.creationDate - a.creationDate)
        );
    }, [filter, questions]);

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
    
    const generatePdf = (exam: Exam, options: { includeOptions: boolean; includeAnswerKey: boolean; }, preview: boolean = false) => {
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

        if (preview) {
            return doc.output('bloburl');
        } else {
            doc.save(`${exam.name.replace(/\s+/g, '_')}.pdf`);
        }
    };

    const handlePreview = () => {
        if (viewingExam) {
            const url = generatePdf(viewingExam, { includeOptions: true, includeAnswerKey: true }, true);
            if (typeof url === 'string') {
                setPreviewPdfUrl(url);
                setIsPreviewModalOpen(true);
            }
        }
    };

    if (viewingExam) {
        return (
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-white/20 backdrop-blur-sm animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-extrabold text-slate-800">{viewingExam.name}</h3>
                    <button onClick={() => setViewingExam(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Voltar</button>
                </div>
                 <div className="flex gap-4 mb-8 flex-col sm:flex-row">
                    <button onClick={() => generatePdf(viewingExam, {includeOptions: true, includeAnswerKey: true})} className="flex-1 px-5 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-500/20">Baixar PDF Completo</button>
                    <button onClick={() => generatePdf(viewingExam, {includeOptions: true, includeAnswerKey: false})} className="flex-1 px-5 py-3 text-sm font-bold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200">PDF (Aluno)</button>
                    <button onClick={handlePreview} className="flex-1 px-5 py-3 text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100">Pré-visualizar</button>
                </div>
                <div className="space-y-4">
                    {viewingExam.questionIds.map((id, index) => {
                        const q = questions.find(q => q.id === id);
                        return q ? <div key={id} className="p-6 border border-slate-100 bg-slate-50/50 rounded-2xl">
                            <div className="flex gap-3">
                                <span className="font-bold text-indigo-500">{index + 1}.</span>
                                <div className="flex-1">
                                    <p className="font-medium text-slate-800 whitespace-pre-wrap">{q.stem}</p>
                                    {q.type === 'objective' && q.options && (
                                        <div className="mt-3 grid grid-cols-1 gap-2">
                                            {q.options.map((option, optIndex) => (
                                                <div key={optIndex} className={`text-sm ${q.answerIndex === optIndex ? 'text-green-700 font-semibold' : 'text-slate-500'}`}>
                                                    <span className="uppercase mr-2">{String.fromCharCode(65 + optIndex)})</span>
                                                    {option}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div> : null;
                    })}
                </div>
                <PdfPreviewModal 
                    isOpen={isPreviewModalOpen} 
                    onClose={() => setIsPreviewModalOpen(false)} 
                    pdfUrl={previewPdfUrl}
                    title={viewingExam.name}
                />
            </div>
        );
    }
    
    return (
        <div className="flex flex-col-reverse lg:grid lg:grid-cols-3 gap-8 h-[calc(100vh-140px)]">
            {/* Left Column: Question Picker */}
            <div className="lg:col-span-2 flex flex-col h-full overflow-hidden">
                <header className="mb-6 flex-shrink-0">
                    <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">Criador de Provas</h2>
                     <p className="text-slate-500 mt-2 text-sm md:text-base">Selecione questões para compor sua avaliação.</p>
                </header>

                 <div className="mb-4">
                    <input
                        type="text"
                        placeholder="Filtrar questões..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="block w-full rounded-xl bg-white border-0 py-3 pl-4 pr-4 text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm"
                    />
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4 pb-20 lg:pb-0">
                    {filteredQuestions.map(q => (
                        <div 
                            key={q.id} 
                            onClick={() => toggleQuestionSelection(q.id)}
                            className={`group p-5 rounded-2xl border transition-all cursor-pointer ${selectedQuestionIds.has(q.id) ? 'bg-indigo-50 border-indigo-500 shadow-md ring-1 ring-indigo-500' : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-md'}`} 
                        >
                            <div className="flex items-start gap-4">
                                <div className={`w-6 h-6 rounded-lg border flex-shrink-0 flex items-center justify-center transition-colors ${selectedQuestionIds.has(q.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white group-hover:border-indigo-400'}`}>
                                    {selectedQuestionIds.has(q.id) && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <div>
                                    <p className="font-medium text-slate-800 line-clamp-2 text-sm md:text-base">{q.stem}</p>
                                     <div className="mt-2 flex gap-2 flex-wrap">
                                        <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-1 rounded-md">{q.discipline}</span>
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${getBloomColorClass(q.bloomLevel)}`}>{q.bloomLevel}</span>
                                     </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right Column: Exam Config & Actions */}
            <div className="lg:col-span-1 space-y-4 lg:space-y-8 flex flex-col lg:h-full lg:overflow-hidden">
                 <div className="bg-white p-6 rounded-3xl shadow-xl border border-white/20 lg:sticky lg:top-0 flex-shrink-0">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </span>
                        Nova Prova
                    </h3>
                    <div className="space-y-4">
                        <input
                            type="text"
                            placeholder="Nome da Avaliação"
                            value={examName}
                            onChange={e => setExamName(e.target.value)}
                            className="block w-full rounded-xl bg-slate-50 border-0 py-3 px-4 text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm"
                        />
                        <div className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 p-3 rounded-xl">
                            <span>Selecionadas</span>
                            <span className="font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md">{selectedQuestionIds.size}</span>
                        </div>
                        <button 
                            onClick={handleSave} 
                            disabled={!examName.trim() || selectedQuestionIds.size === 0} 
                            className="w-full bg-slate-800 text-white font-bold py-3.5 rounded-xl hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-slate-800/20"
                        >
                            Salvar Prova
                        </button>
                    </div>
                </div>
                
                <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100 flex-1 overflow-hidden flex flex-col max-h-[300px] lg:max-h-full">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Minhas Provas</h3>
                    <div className="space-y-3 overflow-y-auto custom-scrollbar flex-1 pr-1">
                        {exams.length > 0 ? exams.map(exam => (
                             <div key={exam.id} className="group flex justify-between items-center p-4 bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded-2xl transition-all shadow-sm">
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-700 truncate">{exam.name}</p>
                                    <p className="text-xs text-slate-400 font-medium">{exam.questionIds.length} questões</p>
                                </div>
                                <div className="flex gap-1">
                                     <button onClick={() => setViewingExam(exam)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Visualizar">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                     </button>
                                     <button onClick={() => onDeleteExam(exam.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Excluir">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                     </button>
                                </div>
                            </div>
                        )) : (
                            <p className="text-center text-slate-400 text-sm py-8">Nenhuma prova criada.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [exams, setExams] = useState<Exam[]>([]);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        const storedQuestions = storageService.getQuestions();
        const storedExams = storageService.getExams();
        setQuestions(storedQuestions);
        setExams(storedExams);
    }, []);

    const handleQuestionsGenerated = (newQuestions: Question[]) => {
        const updated = [...newQuestions, ...questions];
        setQuestions(updated);
        storageService.saveQuestions(updated);
        setNotification({ message: 'Questões geradas com sucesso!', type: 'success' });
    };

    const handleDelete = (id: string) => {
        const updated = questions.filter(q => q.id !== id);
        setQuestions(updated);
        storageService.saveQuestions(updated);
        // Also update exams to remove deleted question
        const updatedExams = exams.map(e => ({
            ...e,
            questionIds: e.questionIds.filter(qid => qid !== id)
        }));
        setExams(updatedExams);
        storageService.saveExams(updatedExams);

        setNotification({ message: 'Questão removida.', type: 'success' });
    };

    const handleToggleFavorite = (id: string) => {
        const updated = questions.map(q => q.id === id ? { ...q, favorited: !q.favorited } : q);
        setQuestions(updated);
        storageService.saveQuestions(updated);
    };

    const handleUpdate = (q: Question) => {
        const updated = questions.map(item => item.id === q.id ? q : item);
        setQuestions(updated);
        storageService.saveQuestions(updated);
        setNotification({ message: 'Questão atualizada.', type: 'success' });
    };

    const handleSaveExam = (exam: Exam) => {
        const updated = [...exams, exam];
        setExams(updated);
        storageService.saveExams(updated);
        setNotification({ message: 'Prova salva com sucesso!', type: 'success' });
    };

    const handleDeleteExam = (id: string) => {
        const updated = exams.filter(e => e.id !== id);
        setExams(updated);
        storageService.saveExams(updated);
        setNotification({ message: 'Prova excluída.', type: 'success' });
    };

    const NavItem: React.FC<{ to: string; children: React.ReactNode; icon: React.ReactNode }> = ({ to, children, icon }) => {
        return (
            <NavLink to={to} className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-300 ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50 scale-105' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}>
                {icon}
                <span className="md:inline">{children}</span>
            </NavLink>
        );
    };

     const MobileNavItem: React.FC<{ to: string; label: string; icon: React.ReactNode }> = ({ to, label, icon }) => {
        return (
            <NavLink to={to} className={({ isActive }) => `flex flex-col items-center justify-center p-2 rounded-xl transition-all ${isActive ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>
                {icon}
                <span className="text-[10px] font-bold mt-1">{label}</span>
            </NavLink>
        );
    };

    return (
        <HashRouter>
            <div className="flex h-screen bg-slate-50 font-sans selection:bg-indigo-200 selection:text-indigo-900 overflow-hidden">
                {/* Desktop Floating Sidebar */}
                <aside className="hidden md:flex w-72 flex-col m-4 rounded-[2rem] bg-slate-900 text-white shadow-2xl relative overflow-hidden">
                     {/* Background decoration */}
                    <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-600 rounded-full blur-[80px] opacity-20"></div>
                    <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-64 h-64 bg-cyan-600 rounded-full blur-[80px] opacity-20"></div>

                    <div className="p-8 relative z-10 flex flex-col h-full">
                         <div className="flex items-center gap-3 mb-10">
                            <div className="bg-gradient-to-br from-indigo-500 to-cyan-500 p-2.5 rounded-xl shadow-lg">
                                <span className="text-2xl">💡</span>
                            </div>
                            <div>
                                <h1 className="text-xl font-black tracking-tight text-white">ENEM Genius</h1>
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">AI Powered</span>
                            </div>
                        </div>

                        <nav className="space-y-3 flex-1">
                             <NavItem to="/" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}>
                                Gerador
                            </NavItem>
                            <NavItem to="/bank" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}>
                                Banco de Itens
                            </NavItem>
                            <NavItem to="/exams" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}>
                                Provas
                            </NavItem>
                        </nav>

                         <button onClick={() => setIsInfoModalOpen(true)} className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold w-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors mt-auto">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Sobre a App
                        </button>
                    </div>
                </aside>

                <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                    {/* Mobile Top Bar */}
                    <div className="md:hidden h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 z-20 flex-shrink-0">
                         <div className="flex items-center gap-2">
                            <div className="bg-gradient-to-br from-indigo-500 to-cyan-500 p-1.5 rounded-lg shadow-md">
                                <span className="text-lg">💡</span>
                            </div>
                            <span className="font-bold text-lg text-slate-800">ENEM Genius</span>
                        </div>
                         <button onClick={() => setIsInfoModalOpen(true)} className="p-2 rounded-full text-slate-400 hover:text-indigo-500 hover:bg-slate-100">
                             <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </button>
                    </div>

                    {/* Main Scrollable Content */}
                    <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 pb-24 md:pb-8 w-full max-w-full">
                        <Routes>
                            <Route path="/" element={<QuestionGenerator onQuestionsGenerated={handleQuestionsGenerated} />} />
                            <Route path="/bank" element={<QuestionBank questions={questions} onDelete={handleDelete} onToggleFavorite={handleToggleFavorite} onUpdate={handleUpdate} />} />
                            <Route path="/exams" element={<ExamCreator questions={questions} exams={exams} onSaveExam={handleSaveExam} onDeleteExam={handleDeleteExam} />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </main>

                     {/* Mobile Bottom Navigation */}
                    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-200 z-50 pb-safe">
                         <div className="flex justify-around items-center h-16">
                            <MobileNavItem to="/" label="Gerador" icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} />
                            <MobileNavItem to="/bank" label="Banco" icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>} />
                            <MobileNavItem to="/exams" label="Provas" icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
                         </div>
                    </nav>

                     {notification && (
                        <Notification 
                            message={notification.message} 
                            type={notification.type} 
                            onDismiss={() => setNotification(null)} 
                        />
                    )}
                    
                    <InfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} />
                </div>
            </div>
        </HashRouter>
    );
};

export default App;
