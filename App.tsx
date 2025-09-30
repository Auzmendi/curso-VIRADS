import React, { useState, useCallback, useEffect } from 'react';
import type { User, CaseData, Evaluation, SurveyResponse } from './types';
import LoginScreen from './components/LoginScreen';
import UploadScreen from './components/UploadScreen';
import EvaluationScreen from './components/EvaluationScreen';
import AnalysisScreen from './components/AnalysisScreen';
import SurveyScreen from './components/SurveyScreen';
import { AppLogo, UserIcon } from './components/icons';

type View = 'login' | 'upload' | 'evaluation' | 'analysis' | 'survey';

const APP_STORAGE_KEY = 'cursoViradsMultiUserSession';

const App: React.FC = () => {
  const [view, setView] = useState<View>('login');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [cases, setCases] = useState<CaseData[]>([]);
  const [allEvaluations, setAllEvaluations] = useState<Record<string, Record<number, Evaluation>>>({});
  const [allSurveyResponses, setAllSurveyResponses] = useState<Record<string, SurveyResponse>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const savedStateJSON = localStorage.getItem(APP_STORAGE_KEY);
      if (savedStateJSON) {
        const savedState = JSON.parse(savedStateJSON);
        setAllUsers(savedState.allUsers || []);
        setCases(savedState.cases || []);
        setAllEvaluations(savedState.allEvaluations || {});
        setAllSurveyResponses(savedState.allSurveyResponses || {});
      }
    } catch (e) {
      console.error("Could not load state from localStorage", e);
      localStorage.removeItem(APP_STORAGE_KEY);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      const stateToSave = { allUsers, cases, allEvaluations, allSurveyResponses };
      localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error("Could not save state to localStorage", e);
    }
  }, [allUsers, cases, allEvaluations, allSurveyResponses, isLoaded]);


  const handleUserSelect = (user: User) => {
    setCurrentUser(user);
    if (cases.length === 0) {
        setView('upload');
    } else {
        setView('evaluation');
    }
  };

  const handleUserCreate = (userData: Omit<User, 'id'>) => {
    const newUser: User = { ...userData, id: crypto.randomUUID() };
    setAllUsers(prev => [...prev, newUser]);
    setCurrentUser(newUser);
     if (cases.length === 0) {
        setView('upload');
    } else {
        setView('evaluation');
    }
  };

  const handleDataUpload = useCallback((uploadedCases: CaseData[]) => {
    setCases(uploadedCases);
    // Reset evaluations and surveys for all users when new data is uploaded
    setAllEvaluations({});
    setAllSurveyResponses({});
    setView('evaluation');
  }, []);

  const handleEvaluationUpdate = (caseNumber: number, evaluation: Evaluation) => {
    if (!currentUser) return;
    setAllEvaluations(prev => ({
        ...prev,
        [currentUser.id]: {
            ...prev[currentUser.id],
            [caseNumber]: evaluation
        }
    }));
  };
  
  const handleGoToAnalysis = () => {
    setView('analysis');
  };

  const handleFinishEvaluations = () => {
      if (currentUser && !allSurveyResponses[currentUser.id]) {
        setView('survey');
      } else {
        setView('analysis');
      }
  };

  const handleSurveyUpdate = (surveyData: Partial<SurveyResponse>) => {
    if (!currentUser) return;
    setAllSurveyResponses(prev => {
        const currentUserSurvey = prev[currentUser.id] || {};
        return {
            ...prev,
            [currentUser.id]: {
                ...currentUserSurvey,
                ...surveyData,
            } as SurveyResponse
        };
    });
  };

  const handleSurveySubmit = (surveyData: SurveyResponse) => {
      if (!currentUser) return;
      setAllSurveyResponses(prev => ({
          ...prev,
          [currentUser.id]: surveyData
      }));
      setView('analysis');
  };

  const handleReturnToLogin = () => {
    setCurrentUser(null);
    setView('login');
  };

  const handleReset = () => {
    localStorage.removeItem(APP_STORAGE_KEY);
    setCurrentUser(null);
    setAllUsers([]);
    setCases([]);
    setAllEvaluations({});
    setAllSurveyResponses({});
    setView('login');
  };
  
  const userEvaluations = currentUser ? allEvaluations[currentUser.id] || {} : {};

  const renderView = () => {
    if (!isLoaded) {
        return (
            <div className="flex justify-center items-center h-64">
                <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            </div>
        );
    }
    
    if (!currentUser) {
        return <LoginScreen users={allUsers} onUserSelect={handleUserSelect} onUserCreate={handleUserCreate} />;
    }

    switch (view) {
      case 'login':
         return <LoginScreen users={allUsers} onUserSelect={handleUserSelect} onUserCreate={handleUserCreate} />;
      case 'upload':
        return <UploadScreen onUpload={handleDataUpload} />;
      case 'evaluation':
        return (
          <EvaluationScreen
            cases={cases}
            evaluations={userEvaluations}
            onUpdate={handleEvaluationUpdate}
            onAnalyze={handleGoToAnalysis}
            onFinishAllEvaluations={handleFinishEvaluations}
            onChangeUser={handleReturnToLogin}
          />
        );
      case 'survey':
        return <SurveyScreen
                    onSubmit={handleSurveySubmit}
                    onUpdate={handleSurveyUpdate}
                    initialData={currentUser ? allSurveyResponses[currentUser.id] : undefined}
                />;
      case 'analysis':
        return <AnalysisScreen 
                    currentUser={currentUser} 
                    allUsers={allUsers}
                    cases={cases} 
                    allEvaluations={allEvaluations} 
                    allSurveyResponses={allSurveyResponses}
                    onReset={handleReset} 
                    onChangeUser={handleReturnToLogin}
                />;
      default:
        return <LoginScreen users={allUsers} onUserSelect={handleUserSelect} onUserCreate={handleUserCreate} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-white shadow-md w-full">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <AppLogo />
              <h1 className="text-xl font-bold text-slate-800">CURSO VIRADS</h1>
            </div>
            {currentUser && (
              <div className="flex items-center space-x-2 text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">
                <UserIcon className="h-5 w-5 text-slate-500" />
                <span>{currentUser.name} {currentUser.surname}</span>
              </div>
            )}
          </div>
        </nav>
      </header>

      <main className="flex-grow container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-7xl mx-auto">
          {renderView()}
        </div>
      </main>

      <footer className="w-full py-4 text-center text-sm text-slate-500">
        <p>&copy; {new Date().getFullYear()} CURSO VIRADS. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
};

export default App;