import React, { useState, useEffect, useRef } from 'react';
import type { SurveyResponse } from '../types';

interface SurveyScreenProps {
    onSubmit: (data: SurveyResponse) => void;
    onUpdate: (data: Partial<SurveyResponse>) => void;
    initialData?: SurveyResponse;
}

const DEFAULT_SURVEY_STATE: SurveyResponse = {
    theoreticalClarity: 0,
    practicalApplication: 0,
    theoryEssential: 0,
    t2CriteriaEase: 0,
    dwiCriteriaEase: 0,
    dceCriteriaEase: 0,
    viradsIntuitive: 0,
    feelMoreConfident: 0,
    mostDifficultAspect: '',
};

const LikertQuestion: React.FC<{
    question: string;
    value: number;
    onChange: (value: number) => void;
    minLabel: string;
    maxLabel: string;
}> = ({ question, value, onChange, minLabel, maxLabel }) => (
    <div className="py-4 border-b border-slate-200">
        <p className="font-medium text-slate-700 mb-3">{question}</p>
        <div className="flex items-center justify-between space-x-2">
            <span className="text-xs text-slate-500 text-center w-20">{minLabel}</span>
            <div className="flex-grow flex justify-center space-x-1 sm:space-x-2">
                {Array.from({ length: 5 }, (_, i) => i + 1).map(num => (
                    <button
                        key={num}
                        type="button"
                        onClick={() => onChange(num)}
                        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full transition text-sm font-bold flex items-center justify-center ${value === num ? 'bg-blue-600 text-white ring-2 ring-offset-2 ring-blue-500' : 'bg-slate-200 hover:bg-slate-300'}`}
                    >
                        {num}
                    </button>
                ))}
            </div>
            <span className="text-xs text-slate-500 text-center w-20">{maxLabel}</span>
        </div>
    </div>
);

const SurveyScreen: React.FC<SurveyScreenProps> = ({ onSubmit, onUpdate, initialData }) => {
    const [surveyData, setSurveyData] = useState(initialData || DEFAULT_SURVEY_STATE);
    
    const isInitialMount = useRef(true);
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        onUpdate(surveyData);
    }, [surveyData, onUpdate]);

    const handleLikertChange = (field: keyof Omit<SurveyResponse, 'mostDifficultAspect'>, value: number) => {
        setSurveyData(prev => ({ ...prev, [field]: value }));
    };

    const isComplete = () => {
        return Object.entries(surveyData).every(([key, value]) => {
            if (key === 'mostDifficultAspect') return true; // Optional for now
            return Number(value) > 0;
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isComplete()) {
            onSubmit(surveyData as SurveyResponse);
        } else {
            alert('Por favor, responda a todas las preguntas de la escala antes de continuar.');
        }
    };
    
    const questions = [
        { key: 'theoreticalClarity', text: 'La clase teórica sobre el impacto clínico de la RM fue clara y útil.' },
        { key: 'practicalApplication', text: 'La clase sobre la aplicación práctica de VI-RADS mejoró mi comprensión de los criterios.' },
        { key: 'theoryEssential', text: 'Considero que la formación teórica fue esencial para la posterior lectura de casos.' },
        { key: 't2CriteriaEase', text: 'Los criterios de la categoría estructural (T2W) son fáciles de aplicar.' },
        { key: 'dwiCriteriaEase', text: 'Los criterios de la categoría de DWI son fáciles de aplicar.' },
        { key: 'dceCriteriaEase', text: 'Los criterios de la categoría de DCE son fáciles de aplicar.' },
        { key: 'viradsIntuitive', text: 'El sistema VI-RADS en su conjunto me parece lógico e intuitivo.' },
        { key: 'feelMoreConfident', text: 'Tras este curso, me siento más seguro/a al utilizar VI-RADS en mi práctica diaria.' },
    ] as const;


    return (
        <div className="w-full max-w-3xl mx-auto animate-fade-in">
            <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Encuesta Post-Formación</h2>
                <p className="text-slate-500 mb-6">¡Felicidades por completar todos los casos! Por favor, dedique un momento a responder las siguientes preguntas.</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-slate-700 mb-4">Valoración (1 = Totalmente en desacuerdo; 5 = Totalmente de acuerdo)</h3>
                        {questions.map(q => (
                             <LikertQuestion
                                key={q.key}
                                question={`${questions.indexOf(q) + 1}. ${q.text}`}
                                value={surveyData[q.key]}
                                onChange={(val) => handleLikertChange(q.key, val)}
                                minLabel="Totalmente en desacuerdo"
                                maxLabel="Totalmente de acuerdo"
                            />
                        ))}
                    </div>
                    
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                         <h3 className="text-lg font-semibold text-slate-700 mb-4">Pregunta Abierta</h3>
                         <div>
                            <label htmlFor="mostDifficultAspect" className="block font-medium text-slate-700 mb-2">9. ¿Cuál fue, en tu opinión, el aspecto más difícil o confuso a la hora de aplicar la clasificación VI-RADS?</label>
                            <textarea
                                id="mostDifficultAspect"
                                value={surveyData.mostDifficultAspect}
                                onChange={(e) => setSurveyData(prev => ({ ...prev, mostDifficultAspect: e.target.value }))}
                                rows={4}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                placeholder="Describa su experiencia aquí..."
                            />
                        </div>
                    </div>
                    
                    <div className="pt-6 text-center">
                        <button
                            type="submit"
                            disabled={!isComplete()}
                            className="w-full sm:w-auto px-10 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Enviar Encuesta y Ver Análisis Final
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default SurveyScreen;