import React, { useState, useEffect, useMemo } from 'react';
import type { User, CaseData, Evaluation, AnalysisMetrics, ConfusionMatrixData, SurveyResponse } from '../types';

declare const XLSX: any;

interface AnalysisScreenProps {
  currentUser: User;
  allUsers: User[];
  cases: CaseData[];
  allEvaluations: Record<string, Record<number, Evaluation>>;
  allSurveyResponses: Record<string, SurveyResponse>;
  onReset: () => void;
  onChangeUser: () => void;
}

const ALL_READERS_ID = 'all-readers';

// --- STATISTICAL UTILITIES ---

// --- Core Math Functions ---
const mean = (data: number[]): number => data.length === 0 ? 0 : data.reduce((a, b) => a + b, 0) / data.length;
const stdDev = (data: number[]): number => {
    if (data.length < 2) return 0;
    const m = mean(data);
    const variance = data.reduce((acc, val) => acc + (val - m) ** 2, 0) / (data.length - 1);
    return Math.sqrt(variance);
};

// --- Gamma and Beta Functions for p-value calculation ---
const logGamma = (x: number): number => {
    const g = 7;
    const p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * Math.exp(logGamma(1 - x)));
    x -= 1;
    let a = p[0];
    const t = x + g + 0.5;
    for (let i = 1; i < p.length; i++) a += p[i] / (x + i);
    return Math.log(Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a);
};

const betacf = (x: number, a: number, b: number): number => {
    const MAXIT = 100, EPS = 3.0e-7, FPMIN = 1.0e-30;
    const qab = a + b, qap = a + 1.0, qam = a - 1.0;
    let c = 1.0, d = 1.0 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1.0 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
        const m2 = 2 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1.0 + aa * d;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        c = 1.0 + aa / c;
        if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1.0 / d;
        h *= d * c;
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1.0 + aa * d;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        c = 1.0 + aa / c;
        if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1.0 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1.0) < EPS) break;
    }
    return h;
};

const betinc = (x: number, a: number, b: number): number => {
    const bt = (x === 0 || x === 1) ? 0 : Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(x, a, b) / a;
    return 1 - bt * betacf(1 - x, b, a) / b;
};

// --- T-Test Implementations ---
interface TTestResult { t: number; df: number; p: number; }

const tTestIndependent = (sample1: number[], sample2: number[]): TTestResult | null => {
    if (sample1.length < 2 || sample2.length < 2) return null;
    const n1 = sample1.length, n2 = sample2.length;
    const mean1 = mean(sample1), mean2 = mean(sample2);
    const std1 = stdDev(sample1), std2 = stdDev(sample2);
    const pooledVar = ((n1 - 1) * std1 ** 2 + (n2 - 1) * std2 ** 2) / (n1 + n2 - 2);
    const se = Math.sqrt(pooledVar * (1 / n1 + 1 / n2));
    if (se === 0) return { t: Infinity, df: n1 + n2 - 2, p: 0 };
    const t = (mean1 - mean2) / se;
    const df = n1 + n2 - 2;
    const p = betinc(df / (df + t * t), df / 2, 0.5);
    return { t, df, p };
};

const tTestPaired = (sample1: number[], sample2: number[]): TTestResult | null => {
    if (sample1.length !== sample2.length || sample1.length < 2) return null;
    const n = sample1.length;
    const diffs = sample1.map((d, i) => d - sample2[i]);
    const meanDiff = mean(diffs);
    const stdDiff = stdDev(diffs);
    if (stdDiff === 0) return { t: Infinity, df: n - 1, p: 0 };
    const t = meanDiff / (stdDiff / Math.sqrt(n));
    const df = n - 1;
    const p = betinc(df / (df + t * t), df / 2, 0.5);
    return { t, df, p };
};


// --- DIAGNOSTIC ACCURACY UTILITIES ---
const standardNormalCdf = (z: number): number => {
  const p = 0.3275911;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2.0);
  const t = 1.0 / (1.0 + p * x);
  const erf = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * erf);
};

const calculatePValue = (z: number): number => 2 * (1 - standardNormalCdf(Math.abs(z)));

const zTestForProportions = (success1: number, total1: number, success2: number, total2: number): number => {
    if (total1 === 0 || total2 === 0) return 1.0;
    
    const p1 = success1 / total1;
    const p2 = success2 / total2;
    const pPooled = (success1 + success2) / (total1 + total2);

    if (pPooled === 0 || pPooled === 1) return 1.0;

    const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / total1 + 1 / total2));
    if (se === 0) return 1.0;

    const z = (p1 - p2) / se;
    return calculatePValue(z);
};

const calculateAUC = (evaluations: Record<number, Evaluation>, cases: CaseData[]): number => {
    const evaluatedCaseNumbers = Object.keys(evaluations).map(Number).filter(cn => evaluations[cn]?.viradsFinal > 0);
    const relevantCases = cases.filter(c => evaluatedCaseNumbers.includes(c.caseNumber));
    if (relevantCases.length === 0) return 0.5;

    const totalPositives = relevantCases.filter(c => c.isCVMIPositive).length;
    const totalNegatives = relevantCases.length - totalPositives;

    if (totalPositives === 0 || totalNegatives === 0) return 0.5;

    const rocPoints = [{ fpr: 0, tpr: 0 }];

    for (const cutoff of [2, 3, 4, 5]) {
        const matrix = getMatrixForEvaluations(evaluations, relevantCases, cutoff);
        const sensitivity = matrix.tp / (matrix.tp + matrix.fn || 1); // TPR
        const specificity = matrix.tn / (matrix.tn + matrix.fp || 1);
        rocPoints.push({ fpr: 1 - specificity, tpr: sensitivity });
    }
    rocPoints.push({ fpr: 1, tpr: 1 });

    const uniqueSortedPoints = [...new Map(rocPoints.map(item => [`${item.fpr}-${item.tpr}`, item])).values()]
                                .sort((a, b) => a.fpr - b.fpr);

    let area = 0;
    for (let i = 1; i < uniqueSortedPoints.length; i++) {
        const p1 = uniqueSortedPoints[i - 1];
        const p2 = uniqueSortedPoints[i];
        area += (p2.fpr - p1.fpr) * (p1.tpr + p2.tpr) / 2;
    }
    return area;
};


const calculateMetrics = (
  matrix: ConfusionMatrixData,
  prevalence: number
): AnalysisMetrics => {
  const { tp, fp, tn, fn } = matrix;
  const totalPositives = tp + fn;
  const totalNegatives = tn + fp;

  const sensitivity = totalPositives > 0 ? tp / totalPositives : 0;
  const specificity = totalNegatives > 0 ? tn / totalNegatives : 0;

  const ppvNumerator = sensitivity * prevalence;
  const ppvDenominator = ppvNumerator + (1 - specificity) * (1 - prevalence);
  const ppv = ppvDenominator > 0 ? ppvNumerator / ppvDenominator : 0;

  const npvNumerator = specificity * (1 - prevalence);
  const npvDenominator = npvNumerator + (1 - sensitivity) * prevalence;
  const npv = npvDenominator > 0 ? npvNumerator / npvDenominator : 0;

  return { sensitivity, specificity, ppv, npv };
};

const getMatrixForEvaluations = (
  evaluations: Record<number, Evaluation>,
  cases: CaseData[],
  cutoff: number
): ConfusionMatrixData => {
  const matrix: ConfusionMatrixData = { tp: 0, fp: 0, tn: 0, fn: 0 };
  const evaluatedCaseNumbers = Object.keys(evaluations).map(Number);

  cases.forEach(c => {
    if (!evaluatedCaseNumbers.includes(c.caseNumber)) return;
    const evaluation = evaluations[c.caseNumber];
    if (!evaluation || evaluation.viradsFinal === 0) return;

    const isTestPositive = evaluation.viradsFinal >= cutoff;
    const isConditionPositive = c.isCVMIPositive;

    if (isTestPositive && isConditionPositive) matrix.tp++;
    else if (isTestPositive && !isConditionPositive) matrix.fp++;
    else if (!isTestPositive && isConditionPositive) matrix.fn++;
    else if (!isTestPositive && !isConditionPositive) matrix.tn++;
  });
  return matrix;
};

// --- UI COMPONENTS ---
const MetricCard: React.FC<{ title: string; value: number | string, description: string }> = ({ title, value, description }) => (
  <div className="bg-white p-4 rounded-lg shadow border border-slate-200">
    <h4 className="text-sm font-medium text-slate-500">{title}</h4>
    <p className="text-3xl font-bold text-blue-600 mt-1">
        {typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : value}
    </p>
    <p className="text-xs text-slate-400 mt-2">{description}</p>
  </div>
);

const TTestResultDisplay: React.FC<{
  title: string;
  data1: { name: string; times: number[] };
  data2: { name: string; times: number[] };
  result: TTestResult | null;
}> = ({ title, data1, data2, result }) => (
    <div className="mt-4 p-4 border border-slate-200 rounded-lg bg-slate-50">
      <h4 className="font-semibold text-slate-800">{title}</h4>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-sm text-slate-500">{data1.name} (n={data1.times.length})</p>
          <p className="text-lg font-bold">{mean(data1.times).toFixed(1)}s</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">{data2.name} (n={data2.times.length})</p>
          <p className="text-lg font-bold">{mean(data2.times).toFixed(1)}s</p>
        </div>
      </div>
      {result && (
        <div className="mt-3 text-center border-t border-slate-200 pt-3">
          <p className={`text-lg font-bold ${result.p < 0.05 ? 'text-green-600' : 'text-slate-700'}`}>
            {result.p < 0.05 ? 'Diferencia Significativa' : 'Sin Diferencia Significativa'}
          </p>
          <p className="text-sm text-slate-500">
            t({result.df.toFixed(0)}) = {result.t.toFixed(2)}, p = {result.p < 0.001 ? '< 0.001' : result.p.toFixed(3)}
          </p>
        </div>
      )}
    </div>
);


const AnalysisScreen: React.FC<AnalysisScreenProps> = ({ currentUser, allUsers, cases, allEvaluations, allSurveyResponses, onReset, onChangeUser }) => {
  const [activeTab, setActiveTab] = useState<'main' | 'comparison' | 'time'>('main');
  const [cutoff, setCutoff] = useState(4);
  const [comparisonPercentage, setComparisonPercentage] = useState(50);

  // State for time analysis
  const [timeUser1, setTimeUser1] = useState<string>(currentUser.id);
  const [timeUser2, setTimeUser2] = useState<string>(allUsers.find(u => u.id !== currentUser.id)?.id || ALL_READERS_ID);
  const [expGroup1, setExpGroup1] = useState('Principiante');
  const [expGroup2, setExpGroup2] = useState('Experto');
  const [timeAnalysisCasePercentage, setTimeAnalysisCasePercentage] = useState(100);

  const samplePrevalence = useMemo(() => {
    if (cases.length === 0) return 0;
    const positiveCases = cases.filter(c => c.isCVMIPositive).length;
    return positiveCases / cases.length;
  }, [cases]);

  const [prevalence, setPrevalence] = useState(samplePrevalence);

  useEffect(() => {
    setPrevalence(samplePrevalence);
  }, [samplePrevalence]);

  const analysisData = useMemo(() => {
    const resultsByUser: any[] = [];
    
    allUsers.forEach(user => {
      const userEvals = allEvaluations[user.id] || {};
      const evaluatedKeys = Object.keys(userEvals).filter(k => userEvals[Number(k)].viradsFinal > 0).map(Number).sort((a,b) => a - b);
      
      if (evaluatedKeys.length === 0) {
        resultsByUser.push({ user, evaluatedCount: 0, finalMetrics: { sensitivity: 0, specificity: 0, ppv: 0, npv: 0 }, partialMetrics: { sensitivity: 0, specificity: 0, ppv: 0, npv: 0 }, finalAuc: 0.5, pValueSensitivity: 1, pValueSpecificity: 1 });
        return;
      }
      
      const evaluatedCases = cases.filter(c => evaluatedKeys.includes(c.caseNumber));

      // Final Metrics
      const finalMatrix = getMatrixForEvaluations(userEvals, evaluatedCases, cutoff);
      const finalMetrics = calculateMetrics(finalMatrix, prevalence);
      const finalAuc = calculateAUC(userEvals, evaluatedCases);
      
      // Partial Metrics
      const partialCount = Math.ceil(evaluatedKeys.length * (comparisonPercentage / 100));
      const partialKeys = evaluatedKeys.slice(0, partialCount);
      const partialEvals: Record<number, Evaluation> = {};
      partialKeys.forEach(key => { partialEvals[key] = userEvals[key]; });
      const partialCases = cases.filter(c => partialKeys.includes(c.caseNumber));
      
      const partialMatrix = getMatrixForEvaluations(partialEvals, partialCases, cutoff);
      const partialMetrics = calculateMetrics(partialMatrix, prevalence);
      
      // P-Values
      const P_final = finalMatrix.tp + finalMatrix.fn;
      const N_final = finalMatrix.tn + finalMatrix.fp;
      const P_partial = partialMatrix.tp + partialMatrix.fn;
      const N_partial = partialMatrix.tn + partialMatrix.fp;

      const pValueSensitivity = zTestForProportions(partialMatrix.tp, P_partial, finalMatrix.tp, P_final);
      const pValueSpecificity = zTestForProportions(partialMatrix.tn, N_partial, finalMatrix.tn, N_final);

      resultsByUser.push({ user, evaluatedCount: evaluatedKeys.length, finalMetrics, partialMetrics, finalAuc, pValueSensitivity, pValueSpecificity });
    });

    const validResults = resultsByUser.filter(r => r.evaluatedCount > 0);
    const averageMetrics = {
        sensitivity: validResults.reduce((acc, r) => acc + r.finalMetrics.sensitivity, 0) / (validResults.length || 1),
        specificity: validResults.reduce((acc, r) => acc + r.finalMetrics.specificity, 0) / (validResults.length || 1),
        ppv: validResults.reduce((acc, r) => acc + r.finalMetrics.ppv, 0) / (validResults.length || 1),
        npv: validResults.reduce((acc, r) => acc + r.finalMetrics.npv, 0) / (validResults.length || 1),
    };

    return { resultsByUser, averageMetrics };

  }, [cutoff, cases, allEvaluations, allUsers, prevalence, comparisonPercentage]);
  
  const timeAnalysisData = useMemo(() => {
    const getFilteredEvaluations = (userEvals: Record<number, Evaluation>): Record<number, Evaluation> => {
        if (!userEvals || timeAnalysisCasePercentage === 100) {
            return userEvals || {};
        }
        const sortedKeys = Object.keys(userEvals).map(Number).sort((a, b) => a - b);
        const count = Math.ceil(sortedKeys.length * (timeAnalysisCasePercentage / 100));
        const filteredKeys = sortedKeys.slice(0, count);
        
        const filteredEvals: Record<number, Evaluation> = {};
        filteredKeys.forEach(key => {
            if (userEvals[key]) {
                filteredEvals[key] = userEvals[key];
            }
        });
        return filteredEvals;
    };

    // Learning curve analysis
    let learningCurveTimes: number[];
    if (timeUser1 === ALL_READERS_ID) {
        const timesByCase: Record<number, number[]> = {};
        allUsers.forEach(user => {
            const userEvals = allEvaluations[user.id] || {};
            const filteredEvals = getFilteredEvaluations(userEvals);
            Object.entries(filteredEvals).forEach(([caseNum, evalData]) => {
                if (evalData.readingTime > 0) {
                    if (!timesByCase[Number(caseNum)]) timesByCase[Number(caseNum)] = [];
                    timesByCase[Number(caseNum)].push(evalData.readingTime);
                }
            });
        });
        learningCurveTimes = Object.keys(timesByCase).map(Number).sort((a, b) => a - b).map(caseNum => mean(timesByCase[caseNum]));
    } else {
        const user1Evals = allEvaluations[timeUser1] || {};
        const filteredEvals = getFilteredEvaluations(user1Evals);
        const user1SortedKeys = Object.keys(filteredEvals).map(Number).sort((a, b) => a - b);
        learningCurveTimes = user1SortedKeys.map(k => filteredEvals[k].readingTime);
    }
    const splitIndex = Math.ceil(learningCurveTimes.length * (comparisonPercentage / 100));
    const firstHalfTimes = learningCurveTimes.slice(0, splitIndex);
    const secondHalfTimes = learningCurveTimes.slice(splitIndex);
    const learningCurveResult = tTestIndependent(firstHalfTimes, secondHalfTimes);

    // Paired reader comparison
    let user1PairedTimes: number[] = [], user2PairedTimes: number[] = [], pairedTestResult: TTestResult | null = null;
    if (timeUser1 !== timeUser2 && timeUser1 && timeUser2) {
        if (timeUser1 !== ALL_READERS_ID && timeUser2 !== ALL_READERS_ID) {
            const user1Evals = getFilteredEvaluations(allEvaluations[timeUser1] || {});
            const user2Evals = getFilteredEvaluations(allEvaluations[timeUser2] || {});
            const commonKeys = Object.keys(user1Evals).filter(k => user2Evals[k] && user1Evals[k].readingTime > 0 && user2Evals[k].readingTime > 0).map(Number);
            user1PairedTimes = commonKeys.map(k => user1Evals[k].readingTime);
            user2PairedTimes = commonKeys.map(k => user2Evals[k].readingTime);
            pairedTestResult = tTestPaired(user1PairedTimes, user2PairedTimes);
        } else { // One of them is 'all'
            const specificUserId = timeUser1 === ALL_READERS_ID ? timeUser2 : timeUser1;
            const specificUserFilteredEvals = getFilteredEvaluations(allEvaluations[specificUserId] || {});
            const caseKeys = Object.keys(specificUserFilteredEvals).map(Number).filter(k => specificUserFilteredEvals[k].readingTime > 0);
            
            const specificUserTimes = caseKeys.map(k => specificUserFilteredEvals[k].readingTime);
            const allReadersAvgTimesForCases = caseKeys.map(caseNum => {
                const timesForCase = allUsers
                    .map(u => {
                        const userFilteredEvals = getFilteredEvaluations(allEvaluations[u.id] || {});
                        return userFilteredEvals[caseNum]?.readingTime;
                    })
                    .filter((t): t is number => t !== undefined && t > 0);
                return mean(timesForCase);
            });
            
            if (timeUser1 === ALL_READERS_ID) {
                user1PairedTimes = allReadersAvgTimesForCases;
                user2PairedTimes = specificUserTimes;
            } else {
                user1PairedTimes = specificUserTimes;
                user2PairedTimes = allReadersAvgTimesForCases;
            }
            pairedTestResult = tTestPaired(user1PairedTimes, user2PairedTimes);
        }
    }
    
    // Experience comparison
    const exp1Users = allUsers.filter(u => u.experience === expGroup1);
    const exp2Users = allUsers.filter(u => u.experience === expGroup2);
    const exp1Times = exp1Users.flatMap(u => Object.values(getFilteredEvaluations(allEvaluations[u.id] || {})).map(e => e.readingTime).filter(t => t > 0));
    const exp2Times = exp2Users.flatMap(u => Object.values(getFilteredEvaluations(allEvaluations[u.id] || {})).map(e => e.readingTime).filter(t => t > 0));
    const experienceTestResult = tTestIndependent(exp1Times, exp2Times);
    
    // General metrics
    const allTimes = Object.values(allEvaluations).flatMap(userEvals => {
        const filtered = getFilteredEvaluations(userEvals);
        return Object.values(filtered).map(e => e.readingTime).filter(t => t > 0);
    });
    const avgTimePerCase = mean(allTimes);
    const totalTime = allTimes.reduce((a, b) => a + b, 0);

    return { avgTimePerCase, totalTime, learningCurveResult, firstHalfTimes, secondHalfTimes, pairedTestResult, user1PairedTimes, user2PairedTimes, experienceTestResult, exp1Times, exp2Times };
  }, [allEvaluations, allUsers, timeUser1, timeUser2, comparisonPercentage, expGroup1, expGroup2, timeAnalysisCasePercentage]);

  const handleExcelExport = () => {
    const workbook = XLSX.utils.book_new();
    
    // --- Sheet 1: Detailed Results ---
    const dataForExcel: any[] = [];
    cases.forEach(c => {
        allUsers.forEach(user => {
            const evaluation: Partial<Evaluation> = allEvaluations[user.id]?.[c.caseNumber] || {};
            dataForExcel.push({
                'ID Lector': user.id, 'Nombre Lector': user.name, 'Apellidos Lector': user.surname, 'Experiencia Lector': user.experience,
                'Nº Caso': c.caseNumber, 'AP (Ground Truth)': c.ap, 'Clasificación AP': c.isCVMIPositive ? 'CVMI' : 'CVNMI',
                'Calidad Imagen': evaluation.imageQuality || '-',
                'Tiempo Lectura (s)': evaluation.readingTime || '-',
                'Evaluación T2': evaluation.t2 || '-', 'Confianza T2': evaluation.t2Confidence || '-',
                'Evaluación Difusión': evaluation.difusion || '-', 'Confianza Difusión': evaluation.difusionConfidence || '-',
                'Evaluación EDC': evaluation.edc || '-', 'Confianza EDC': evaluation.edcConfidence || '-',
                'Evaluación VIRADS Final': evaluation.viradsFinal || '-', 'Confianza VIRADS Final': evaluation.viradsFinalConfidence || '-',
            });
        });
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados Completos');

    // --- Sheet 2: Survey Results ---
    const surveyDataForExcel = allUsers
        .map(user => {
            const survey = allSurveyResponses[user.id];
            if (!survey) return null;
            return {
                'ID Lector': user.id, 'Nombre Lector': user.name, 'Apellidos Lector': user.surname,
                '1. Claridad Impacto Clínico': survey.theoreticalClarity,
                '2. Claridad Aplicación Práctica': survey.practicalApplication,
                '3. Formación Teórica Esencial': survey.theoryEssential,
                '4. Facilidad Criterios T2W': survey.t2CriteriaEase,
                '5. Facilidad Criterios DWI': survey.dwiCriteriaEase,
                '6. Facilidad Criterios DCE': survey.dceCriteriaEase,
                '7. VIRADS Lógico e Intuitivo': survey.viradsIntuitive,
                '8. Más Confianza Post-Curso': survey.feelMoreConfident,
                '9. Aspecto Más Difícil (Abierta)': survey.mostDifficultAspect,
            };
        })
        .filter(Boolean); 
    
    if (surveyDataForExcel.length > 0) {
        const surveyWorksheet = XLSX.utils.json_to_sheet(surveyDataForExcel);
        XLSX.utils.book_append_sheet(workbook, surveyWorksheet, 'Resultados Encuesta');
    }

    XLSX.writeFile(workbook, `Resultados_VIRADS_Completos.xlsx`);
  };
  
   const PValueCell = ({ pValue }: { pValue: number }) => {
     let text = `p = ${pValue.toFixed(3)}`;
     if (pValue < 0.001) text = 'p < 0.001';
     const isSignificant = pValue < 0.05;
     return <td className={`px-4 py-3 text-center ${isSignificant ? 'font-bold text-green-700' : ''}`}>{text}</td>
   };
   const MetricCell = ({ value }: { value: number }) => <td className="px-4 py-3 text-center">{(value * 100).toFixed(1)}%</td>;
   const DeltaCell = ({ val1, val2 }: { val1: number, val2: number }) => {
       const delta = (val2 - val1) * 100;
       const color = delta > 0.1 ? 'text-green-600' : delta < -0.1 ? 'text-red-600' : 'text-slate-500';
       return <td className={`px-4 py-3 text-center font-semibold ${color}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</td>
   };
   const experienceLevels = ['Principiante', 'Intermedio', 'Experto'];
   
   const getUserNameById = (id: string): string => {
        if (id === ALL_READERS_ID) return 'Todos los Lectores';
        const user = allUsers.find(u => u.id === id);
        return user ? `${user.name} ${user.surname}` : 'Desconocido';
    };

  return (
    <div className="animate-fade-in space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-slate-800">Resultados del Análisis Diagnóstico</h2>
        <p className="text-slate-500 mt-2">Bienvenido al panel de análisis, {currentUser.name}.</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200 space-y-6">
        <h3 className="text-xl font-semibold text-slate-700">Configuración Global del Análisis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <label htmlFor="cutoff" className="block text-sm font-medium text-slate-700">Punto de corte VIRADS final (≥)</label>
                <div className="flex items-center space-x-4 mt-2">
                  <input type="range" id="cutoff" min="2" max="5" step="1" value={cutoff} onChange={(e) => setCutoff(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                  <span className="font-bold text-blue-600 text-lg w-12 text-center">{cutoff}</span>
                </div>
            </div>
            <div>
                <label htmlFor="prevalence" className="block text-sm font-medium text-slate-700">Prevalencia de CVMI (%)</label>
                <input type="number" id="prevalence" step="0.1" min="0" max="100" value={(prevalence * 100).toFixed(1)} onChange={e => setPrevalence(parseFloat(e.target.value) / 100)} className="w-full mt-2 px-4 py-2 border border-slate-300 rounded-lg" />
                <p className="text-xs text-slate-500 mt-1">Prevalencia de la muestra: {(samplePrevalence * 100).toFixed(1)}%.</p>
            </div>
        </div>
      </div>
      
       <div className="w-full">
         <div className="flex justify-center border-b border-slate-200 mb-6" role="tablist">
            <button onClick={() => setActiveTab('main')} role="tab" aria-selected={activeTab === 'main'} className={`px-6 py-3 font-semibold text-lg transition-colors ${activeTab === 'main' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-blue-500'}`}>Análisis General</button>
            <button onClick={() => setActiveTab('comparison')} role="tab" aria-selected={activeTab === 'comparison'} className={`px-6 py-3 font-semibold text-lg transition-colors ${activeTab === 'comparison' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-blue-500'}`}>Curva de Aprendizaje</button>
            <button onClick={() => setActiveTab('time')} role="tab" aria-selected={activeTab === 'time'} className={`px-6 py-3 font-semibold text-lg transition-colors ${activeTab === 'time' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-blue-500'}`}>Análisis de Tiempos</button>
         </div>

        {activeTab === 'main' && (
          <div className="space-y-8 animate-fade-in" role="tabpanel">
            <div className="space-y-4">
                <h3 className="text-xl font-semibold text-slate-700 text-center">Resultados Promedio del Grupo</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <MetricCard title="Sensibilidad Media" value={analysisData.averageMetrics.sensitivity} description="Capacidad media para detectar CVMI." />
                    <MetricCard title="Especificidad Media" value={analysisData.averageMetrics.specificity} description="Capacidad media para descartar CVMI."/>
                    <MetricCard title="VPP Medio" value={analysisData.averageMetrics.ppv} description="Probabilidad media de CVMI si VIRADS es positivo."/>
                    <MetricCard title="VPN Medio" value={analysisData.averageMetrics.npv} description="Probabilidad media de no CVMI si VIRADS es negativo."/>
                </div>
            </div>
             <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200">
                <h3 className="text-xl font-semibold text-slate-700 mb-4">Rendimiento Individual por Lector</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100">
                           <tr>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Lector</th>
                                <th className="px-4 py-3 text-center font-semibold text-slate-600">Casos Leídos</th>
                                <th className="px-4 py-3 text-center font-semibold text-slate-600" title="Sensibilidad">Sens.</th>
                                <th className="px-4 py-3 text-center font-semibold text-slate-600" title="Especificidad">Espec.</th>
                                <th className="px-4 py-3 text-center font-semibold text-slate-600" title="Valor Predictivo Positivo">VPP</th>
                                <th className="px-4 py-3 text-center font-semibold text-slate-600" title="Valor Predictivo Negativo">VPN</th>
                                <th className="px-4 py-3 text-center font-semibold text-slate-600" title="Área Bajo la Curva ROC">AUC</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                           {analysisData.resultsByUser.map(({ user, evaluatedCount, finalMetrics, finalAuc }) => (
                               <tr key={user.id} className={user.id === currentUser.id ? 'bg-blue-50' : ''}>
                                   <td className="px-4 py-3 font-semibold">{user.name} {user.surname}</td>
                                   <td className="px-4 py-3 text-center">{evaluatedCount}</td>
                                   <MetricCell value={finalMetrics.sensitivity} />
                                   <MetricCell value={finalMetrics.specificity} />
                                   <MetricCell value={finalMetrics.ppv} />
                                   <MetricCell value={finalMetrics.npv} />
                                   <td className="px-4 py-3 text-center font-bold">{finalAuc.toFixed(3)}</td>
                               </tr>
                           ))}
                        </tbody>
                    </table>
                </div>
            </div>
          </div>
        )}
        
        {activeTab === 'comparison' && (
           <div className="space-y-8 animate-fade-in" role="tabpanel">
                <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200">
                     <label htmlFor="comparison" className="block text-sm font-medium text-slate-700">Comparar métricas del primer X% de casos leídos vs. el total</label>
                    <div className="flex items-center space-x-4 mt-2">
                        <input type="range" id="comparison" min="10" max="100" step="10" value={comparisonPercentage} onChange={(e) => setComparisonPercentage(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                        <span className="font-bold text-blue-600 text-lg w-16 text-center">{comparisonPercentage}%</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200">
                    <h3 className="text-xl font-semibold text-slate-700 mb-4">Análisis Comparativo de Precisión por Lector</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100">
                                <tr>
                                    <th rowSpan={2} className="px-4 py-3 text-left font-semibold text-slate-600 align-bottom">Lector</th>
                                    <th colSpan={4} className="px-4 py-3 text-center font-semibold text-slate-600 border-b border-l border-slate-300">Sensibilidad</th>
                                    <th colSpan={4} className="px-4 py-3 text-center font-semibold text-slate-600 border-b border-l border-slate-300">Especificidad</th>
                                </tr>
                                <tr className="bg-slate-50">
                                    <th className="px-4 py-2 font-medium text-slate-500 border-l border-slate-300">Parcial ({comparisonPercentage}%)</th>
                                    <th className="px-4 py-2 font-medium text-slate-500">Final</th>
                                    <th className="px-4 py-2 font-medium text-slate-500">Δ</th>
                                    <th className="px-4 py-2 font-medium text-slate-500">p-valor</th>
                                    <th className="px-4 py-2 font-medium text-slate-500 border-l border-slate-300">Parcial ({comparisonPercentage}%)</th>
                                    <th className="px-4 py-2 font-medium text-slate-500">Final</th>
                                    <th className="px-4 py-2 font-medium text-slate-500">Δ</th>
                                    <th className="px-4 py-2 font-medium text-slate-500">p-valor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {analysisData.resultsByUser.map(({ user, finalMetrics, partialMetrics, pValueSensitivity, pValueSpecificity }) => (
                                  <tr key={user.id} className={user.id === currentUser.id ? 'bg-blue-50' : ''}>
                                      <td className="px-4 py-3 font-semibold">{user.name} {user.surname}</td>
                                      <MetricCell value={partialMetrics.sensitivity} />
                                      <MetricCell value={finalMetrics.sensitivity} />
                                      <DeltaCell val1={partialMetrics.sensitivity} val2={finalMetrics.sensitivity} />
                                      <PValueCell pValue={pValueSensitivity} />
                                      <MetricCell value={partialMetrics.specificity} />
                                      <MetricCell value={finalMetrics.specificity} />
                                      <DeltaCell val1={partialMetrics.specificity} val2={finalMetrics.specificity} />
                                      <PValueCell pValue={pValueSpecificity} />
                                  </tr>
                              ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}
        
        {activeTab === 'time' && (
          <div className="space-y-8 animate-fade-in" role="tabpanel">
            <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200">
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Filtro Global de Casos</h3>
                <p className="text-sm text-slate-500 mb-4">
                    Ajuste este control para incluir solo un subconjunto inicial de los casos leídos por cada lector en todos los análisis de esta pestaña.
                </p>
                <label htmlFor="timeAnalysisCasePercentage" className="block text-sm font-medium text-slate-700">Analizar los primeros X% de casos leídos</label>
                <div className="flex items-center space-x-4 mt-2">
                    <input type="range" id="timeAnalysisCasePercentage" min="10" max="100" step="10" value={timeAnalysisCasePercentage} onChange={(e) => setTimeAnalysisCasePercentage(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                    <span className="font-bold text-blue-600 text-lg w-16 text-center">{timeAnalysisCasePercentage}%</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-center">
                 <MetricCard title="Tiempo Medio por Caso" value={`${timeAnalysisData.avgTimePerCase.toFixed(1)}s`} description="Promedio de todos los lectores y casos filtrados." />
                 <MetricCard title="Tiempo Total de Lectura" value={`${(timeAnalysisData.totalTime / 60).toFixed(1)} min`} description="Suma de todos los tiempos de lectura filtrados." />
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200">
                <h3 className="text-xl font-semibold text-slate-700 mb-4">Análisis de Curva de Aprendizaje (Tiempo)</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="timeUser1" className="block text-sm font-medium text-slate-700">Seleccionar Lector</label>
                        <select id="timeUser1" value={timeUser1} onChange={e => setTimeUser1(e.target.value)} className="mt-1 w-full px-4 py-2 border border-slate-300 rounded-lg">
                            <option value={ALL_READERS_ID}>Todos los Lectores</option>
                            {allUsers.map(u => <option key={u.id} value={u.id}>{u.name} {u.surname}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="timeComparison" className="block text-sm font-medium text-slate-700">Comparar primer X% de casos vs. resto</label>
                        <div className="flex items-center space-x-4">
                            <input type="range" id="timeComparison" min="10" max="90" step="10" value={comparisonPercentage} onChange={(e) => setComparisonPercentage(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                            <span className="font-bold text-blue-600 text-lg w-16 text-center">{comparisonPercentage}%</span>
                        </div>
                    </div>
                 </div>
                 <TTestResultDisplay 
                    title="Resultado del Test (t-Student Muestras Independientes)"
                    data1={{ name: `Primer ${comparisonPercentage}%`, times: timeAnalysisData.firstHalfTimes }}
                    data2={{ name: `Restantes`, times: timeAnalysisData.secondHalfTimes }}
                    result={timeAnalysisData.learningCurveResult}
                 />
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200">
                <h3 className="text-xl font-semibold text-slate-700 mb-4">Comparación de Tiempos entre Dos Lectores</h3>
                <p className="text-sm text-slate-500 mb-4">Compara un lector contra otro o contra el promedio del grupo. Solo se usan casos evaluados por ambos dentro del filtro global.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="timeUser1Comp" className="block text-sm font-medium text-slate-700">Lector / Grupo 1</label>
                        <select id="timeUser1Comp" value={timeUser1} onChange={e => setTimeUser1(e.target.value)} className="mt-1 w-full px-4 py-2 border border-slate-300 rounded-lg">
                            <option value={ALL_READERS_ID}>Todos los Lectores</option>
                            {allUsers.map(u => <option key={u.id} value={u.id}>{u.name} {u.surname}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="timeUser2Comp" className="block text-sm font-medium text-slate-700">Lector / Grupo 2</label>
                        <select id="timeUser2Comp" value={timeUser2} onChange={e => setTimeUser2(e.target.value)} className="mt-1 w-full px-4 py-2 border border-slate-300 rounded-lg" disabled={!timeUser1}>
                           {timeUser1 !== ALL_READERS_ID && <option value={ALL_READERS_ID}>Todos los Lectores</option>}
                           {allUsers.filter(u => u.id !== timeUser1).map(u => <option key={u.id} value={u.id}>{u.name} {u.surname}</option>)}
                        </select>
                    </div>
                </div>
                 <TTestResultDisplay 
                    title="Resultado del Test (t-Student Muestras Emparejadas)"
                    data1={{ name: getUserNameById(timeUser1), times: timeAnalysisData.user1PairedTimes }}
                    data2={{ name: getUserNameById(timeUser2), times: timeAnalysisData.user2PairedTimes }}
                    result={timeAnalysisData.pairedTestResult}
                 />
            </div>

             <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-200">
                <h3 className="text-xl font-semibold text-slate-700 mb-4">Comparación de Tiempos por Experiencia</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="expGroup1" className="block text-sm font-medium text-slate-700">Grupo 1</label>
                        <select id="expGroup1" value={expGroup1} onChange={e => setExpGroup1(e.target.value)} className="mt-1 w-full px-4 py-2 border border-slate-300 rounded-lg">
                            {experienceLevels.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="expGroup2" className="block text-sm font-medium text-slate-700">Grupo 2</label>
                        <select id="expGroup2" value={expGroup2} onChange={e => setExpGroup2(e.target.value)} className="mt-1 w-full px-4 py-2 border border-slate-300 rounded-lg">
                            {experienceLevels.filter(lvl => lvl !== expGroup1).map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                        </select>
                    </div>
                </div>
                 <TTestResultDisplay 
                    title="Resultado del Test (t-Student Muestras Independientes)"
                    data1={{ name: expGroup1, times: timeAnalysisData.exp1Times }}
                    data2={{ name: expGroup2, times: timeAnalysisData.exp2Times }}
                    result={timeAnalysisData.experienceTestResult}
                 />
            </div>

          </div>
        )}

       </div>

      <div className="text-center pt-6 border-t border-slate-200 mt-8">
        <h3 className="text-lg font-semibold text-slate-700 mb-4">Acciones</h3>
        <div className="flex flex-wrap items-center justify-center gap-4">
            <button onClick={onChangeUser} className="px-6 py-3 bg-slate-500 text-white font-bold rounded-lg hover:bg-slate-600 transition">Cambiar de Lector</button>
            <button onClick={handleExcelExport} className="px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition">Exportar Todo a Excel</button>
            <button onClick={onReset} className="px-8 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition">Reiniciar Aplicación (Borrar Todo)</button>
        </div>
      </div>
    </div>
  );
};

export default AnalysisScreen;