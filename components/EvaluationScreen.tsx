import React, { useState, useEffect, useRef } from 'react';
import type { CaseData, Evaluation } from '../types';

interface EvaluationScreenProps {
  cases: CaseData[];
  evaluations: Record<number, Evaluation>;
  onUpdate: (caseNumber: number, evaluation: Evaluation) => void;
  onAnalyze: () => void;
  onFinishAllEvaluations: () => void;
  onChangeUser: () => void;
}

const DEFAULT_EVAL: Evaluation = {
  t2: 0, difusion: 0, edc: 0, viradsFinal: 0,
  t2Confidence: 0, difusionConfidence: 0, edcConfidence: 0, viradsFinalConfidence: 0,
  imageQuality: 0, readingTime: 0,
};

const RatingControl: React.FC<{ label: string; max: number; value: number; onChange: (value: number) => void; labels?: string[] }> = ({ label, max, value, onChange, labels }) => (
    <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <div className="flex space-x-1">
            {Array.from({ length: max }, (_, i) => i + 1).map(num => (
                <button
                    key={num}
                    type="button"
                    onClick={() => onChange(num)}
                    className={`w-full text-xs sm:text-sm h-10 rounded-md transition ${value === num ? 'bg-blue-600 text-white font-bold' : 'bg-slate-200 hover:bg-slate-300'}`}
                >
                    {labels?.[num-1] || num}
                </button>
            ))}
        </div>
    </div>
);

const EvaluationScreen: React.FC<EvaluationScreenProps> = ({ cases, evaluations, onUpdate, onAnalyze, onFinishAllEvaluations, onChangeUser }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentEval, setCurrentEval] = useState<Evaluation>(DEFAULT_EVAL);

  // Timer state
  const [timerIsActive, setTimerIsActive] = useState(false);
  const [sessionTime, setSessionTime] = useState(0); // Time in seconds for the current viewing session
  const timerStartRef = useRef(0);
  
  const totalCases = cases.length;
  const currentCase = cases[currentIndex];

  const evaluatedCasesCount = Object.keys(evaluations).filter(key => evaluations[Number(key)].viradsFinal > 0).length;
  const allCasesEvaluated = totalCases > 0 && evaluatedCasesCount === totalCases;
  const progressPercentage = totalCases > 0 ? (evaluatedCasesCount / totalCases) * 100 : 0;

  // --- Validation logic for the 'Next' button ---
  const totalTimeForCase = (currentEval.readingTime || 0) + sessionTime;
  const isEvaluationComplete = 
    currentEval.imageQuality > 0 &&
    currentEval.t2 > 0 &&
    currentEval.difusion > 0 &&
    currentEval.edc > 0 &&
    currentEval.viradsFinal > 0 &&
    currentEval.t2Confidence > 0 &&
    currentEval.difusionConfidence > 0 &&
    currentEval.edcConfidence > 0 &&
    currentEval.viradsFinalConfidence > 0;

  const isNextButtonEnabled = !timerIsActive && totalTimeForCase > 0 && isEvaluationComplete;
  // --- End of validation logic ---

  useEffect(() => {
    if (!currentCase) return;
    const existingEval = evaluations[currentCase.caseNumber];
    setCurrentEval(existingEval || { ...DEFAULT_EVAL });
    // Reset timer state for the new case
    setTimerIsActive(false);
    setSessionTime(0);
  }, [currentIndex, cases, evaluations, currentCase]);
  
  useEffect(() => {
    let interval: number | null = null;
    if (timerIsActive) {
      timerStartRef.current = Date.now() - sessionTime * 1000;
      interval = window.setInterval(() => {
        setSessionTime(Math.floor((Date.now() - timerStartRef.current) / 1000));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerIsActive, sessionTime]);

  const handleEvalChange = (field: keyof Evaluation, value: number) => {
    const updatedEval = { ...currentEval, [field]: value };
    setCurrentEval(updatedEval);
    onUpdate(currentCase.caseNumber, updatedEval);
  };
  
  const saveAndNavigate = (navigationFn: () => void) => {
    const newTotalTime = (currentEval.readingTime || 0) + sessionTime;
    const finalEvalForCase = { ...currentEval, readingTime: newTotalTime };
    onUpdate(currentCase.caseNumber, finalEvalForCase);
    navigationFn();
  };
  
  // --- Timer Controls ---
  const handleStartTimer = () => setTimerIsActive(true);
  
  const handleStopTimer = () => {
    setTimerIsActive(false);
    const newTotalTime = (currentEval.readingTime || 0) + sessionTime;
    const updatedEval = { ...currentEval, readingTime: newTotalTime };
    setCurrentEval(updatedEval);
    onUpdate(currentCase.caseNumber, updatedEval);
    setSessionTime(0); // Reset session time after committing it
  };
  
  const handleResetTimer = () => {
    setTimerIsActive(false);
    setSessionTime(0);
    const updatedEval = { ...currentEval, readingTime: 0 };
    setCurrentEval(updatedEval);
    onUpdate(currentCase.caseNumber, updatedEval);
  };
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const goToNext = () => {
    if (currentIndex < totalCases - 1) {
      saveAndNavigate(() => setCurrentIndex(currentIndex + 1));
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      saveAndNavigate(() => setCurrentIndex(currentIndex - 1));
    }
  };

  const handleChangeUser = () => {
    saveAndNavigate(onChangeUser);
  };

  if (!currentCase) {
    return (
        <div className="w-full max-w-3xl mx-auto animate-fade-in">
            <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200 text-center">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Paso 2: Evaluación de Casos</h2>
                <p className="text-slate-500 mt-4">No hay casos cargados para evaluar. Por favor, vuelva a la pantalla de inicio y cargue un archivo Excel.</p>
            </div>
        </div>
    );
  }
  
  const renderViradsInput = (key: keyof Evaluation, label: string) => {
      const confidenceKey = `${key}Confidence` as keyof Evaluation;
      return (
          <div key={key} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                  <label htmlFor={key} className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                  <input
                      type="number" id={key} min="1" max="5"
                      value={currentEval[key] || ''}
                      onChange={(e) => {
                        const numValue = parseInt(e.target.value, 10);
                        if (!isNaN(numValue) && numValue >= 1 && numValue <= 5) {
                           handleEvalChange(key, numValue);
                        } else if(e.target.value === ''){
                           handleEvalChange(key, 0);
                        }
                      }}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                      placeholder="Valor 1-5"
                  />
              </div>
              <RatingControl
                  label="Nivel de Confianza"
                  max={5}
                  value={currentEval[confidenceKey] as number}
                  onChange={(val) => handleEvalChange(confidenceKey, val)}
              />
          </div>
      );
  };

  return (
    <div className="w-full max-w-4xl mx-auto animate-fade-in">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Paso 2: Evaluación de Casos</h2>
            <p className="text-slate-500 mb-6">Introduzca su valoración para cada caso.</p>
            
            <div className="mb-6">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-slate-700">Progreso de Evaluación (VIRADS Final)</span>
                    <span className="text-sm font-medium text-slate-700">{evaluatedCasesCount} de {totalCases}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                    <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progressPercentage}%` }}></div>
                </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 space-y-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center">
                    <h3 className="text-xl font-bold text-blue-700 mb-4 sm:mb-0">Caso a valorar N°: {currentCase.caseNumber}</h3>
                    <div className="flex items-center space-x-2 p-2 rounded-lg bg-slate-100 border border-slate-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-2xl font-mono font-bold text-slate-800 w-20 text-center">
                           {formatTime(totalTimeForCase)}
                        </span>
                        <button onClick={handleStartTimer} disabled={timerIsActive} title="Iniciar" className="p-2 rounded-full bg-green-100 text-green-700 hover:bg-green-200 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                            </svg>
                        </button>
                        <button onClick={handleStopTimer} disabled={!timerIsActive} title="Parar" className="p-2 rounded-full bg-red-100 text-red-700 hover:bg-red-200 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                           </svg>
                        </button>
                        <button onClick={handleResetTimer} title="Reiniciar" className="p-2 rounded-full bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm10 8a1 1 0 011-1v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 011.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-2.457 2.566 1 1 0 11-.666-1.885A5.002 5.002 0 0014 15.001z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>
                <hr />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="md:col-span-2">
                       <RatingControl label="Calidad de Imagen Subjetiva" max={3} value={currentEval.imageQuality} onChange={(val) => handleEvalChange('imageQuality', val)} labels={['Mala', 'Adecuada', 'Excelente']} />
                    </div>
                    {renderViradsInput('t2', 'T2')}
                    {renderViradsInput('difusion', 'Difusión')}
                    {renderViradsInput('edc', 'EDC')}
                    {renderViradsInput('viradsFinal', 'VIRADS final')}
                </div>
            </div>

            <div className="mt-8 flex flex-wrap justify-between items-center gap-4">
                <button
                    onClick={goToPrev}
                    disabled={currentIndex === 0}
                    className="px-6 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                    Anterior
                </button>
                <div className="flex items-center space-x-4">
                     <button
                        onClick={handleChangeUser}
                        className="px-6 py-2 bg-slate-500 text-white font-semibold rounded-lg hover:bg-slate-600 transition"
                        title="Vuelve a la pantalla de selección de usuario"
                    >
                        Cambiar de Lector
                    </button>
                    <button
                        onClick={goToNext}
                        disabled={currentIndex === totalCases - 1 || !isNextButtonEnabled}
                        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        title={!isNextButtonEnabled ? "Debe parar el cronómetro, registrar un tiempo y completar todos los campos para continuar." : "Ir al siguiente caso"}
                    >
                        Siguiente
                    </button>
                </div>
                {allCasesEvaluated ? (
                    <button
                        onClick={onFinishAllEvaluations}
                        className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors animate-pulse"
                        title="Todos los casos han sido evaluados."
                    >
                        Finalizar y realizar encuesta
                    </button>
                ) : (
                    <button
                        onClick={onAnalyze}
                        className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors"
                        title="Analizar los resultados con los datos introducidos hasta ahora"
                    >
                        Analizar Resultados
                    </button>
                )}
            </div>
        </div>
    </div>
  );
};

export default EvaluationScreen;