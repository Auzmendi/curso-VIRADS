export type APStage = 'Ta' | 'Tis' | 'T1' | 'T2' | 'T3' | 'T4';

export const CVNMI_STAGES: APStage[] = ['Ta', 'Tis', 'T1'];
export const CVMI_STAGES: APStage[] = ['T2', 'T3', 'T4'];

export interface CaseData {
  caseNumber: number;
  ap: APStage;
  isCVMIPositive: boolean;
}

export interface User {
  id: string;
  name: string;
  surname: string;
  experience: string;
}

export interface Evaluation {
  t2: number;
  difusion: number;
  edc: number;
  viradsFinal: number;
  // New fields
  t2Confidence: number;
  difusionConfidence: number;
  edcConfidence: number;
  viradsFinalConfidence: number;
  imageQuality: number; // 1=Mala, 2=Adecuada, 3=Excelente
  readingTime: number; // in seconds
}

export interface SurveyResponse {
  theoreticalClarity: number;
  practicalApplication: number;
  theoryEssential: number;
  t2CriteriaEase: number;
  dwiCriteriaEase: number;
  dceCriteriaEase: number;
  viradsIntuitive: number;
  feelMoreConfident: number;
  mostDifficultAspect: string;
}

export interface AnalysisMetrics {
  sensitivity: number;
  specificity: number;
  ppv: number;
  npv: number;
}

export interface ConfusionMatrixData {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}