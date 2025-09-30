import React, { useState, useCallback } from 'react';
import type { CaseData, APStage } from '../types';
import { CVMI_STAGES, CVNMI_STAGES } from '../types';
import { UploadIcon, CheckCircleIcon } from './icons';

declare const XLSX: any;

interface UploadScreenProps {
  onUpload: (cases: CaseData[]) => void;
}

const ALL_STAGES = [...CVMI_STAGES, ...CVNMI_STAGES];

const UploadScreen: React.FC<UploadScreenProps> = ({ onUpload }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    setIsLoading(true);
    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) {
            throw new Error("El archivo Excel está vacío o tiene un formato incorrecto.");
        }

        const parsedCases: CaseData[] = json.map((row: any, index: number) => {
          const caseNumber = row['número de caso'];
          const ap = row['AP']?.toString().trim() as APStage;

          if (typeof caseNumber !== 'number' || !ap) {
            throw new Error(`Error en la fila ${index + 2}: Las columnas 'número de caso' (debe ser numérico) y 'AP' son obligatorias.`);
          }
          
          if(!ALL_STAGES.includes(ap)) {
            throw new Error(`Error en la fila ${index + 2}: El valor de AP '${ap}' no es válido. Valores permitidos: ${ALL_STAGES.join(', ')}.`);
          }

          return {
            caseNumber,
            ap,
            isCVMIPositive: CVMI_STAGES.includes(ap),
          };
        });
        
        // Sort cases by case number
        parsedCases.sort((a, b) => a.caseNumber - b.caseNumber);

        setTimeout(() => {
          onUpload(parsedCases);
        }, 1000); // Simulate processing time

      } catch (err) {
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError("Ocurrió un error desconocido al procesar el archivo.");
        }
        setIsLoading(false);
        setFileName(null);
      }
    };
    reader.onerror = () => {
        setError("No se pudo leer el archivo.");
        setIsLoading(false);
        setFileName(null);
    };
    reader.readAsArrayBuffer(file);
  }, [onUpload]);

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      handleFile(event.dataTransfer.files[0]);
      event.dataTransfer.clearData();
    }
  }, [handleFile]);
  
  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  
  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      handleFile(event.target.files[0]);
    }
  };


  return (
    <div className="w-full max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-lg border border-slate-200 animate-fade-in">
      <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">Paso 1: Cargar datos de los casos</h2>
      <p className="text-center text-slate-500 mb-8">Suba el archivo Excel con los datos de anatomía patológica.</p>
      
      <div 
        className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center cursor-pointer hover:border-blue-500 bg-slate-50 transition"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => document.getElementById('file-upload')?.click()}
      >
        <input type="file" id="file-upload" className="hidden" accept=".xlsx, .xls" onChange={onFileChange}/>
        <UploadIcon className="mx-auto h-12 w-12 text-slate-400" />
        <p className="mt-2 text-sm text-slate-600">
          <span className="font-semibold text-blue-600">Haga clic para cargar</span> o arrastre y suelte el archivo.
        </p>
        <p className="text-xs text-slate-500 mt-1">Formato admitido: .xlsx, .xls</p>
      </div>

      {isLoading && (
         <div className="mt-6 text-center">
            <div className="flex items-center justify-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-slate-600">Procesando archivo: {fileName}...</span>
            </div>
        </div>
      )}

      {fileName && !isLoading && !error && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-3">
          <CheckCircleIcon className="h-6 w-6 text-green-600" />
          <p className="text-green-800 font-medium">Archivo "{fileName}" cargado y validado. Listo para continuar.</p>
        </div>
      )}

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <p className="font-bold">Error de Carga</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="mt-6 bg-slate-100 p-4 rounded-lg border border-slate-200">
        <h4 className="font-semibold text-slate-700">Formato esperado del Excel:</h4>
        <ul className="list-disc list-inside text-sm text-slate-600 mt-2 space-y-1">
          <li>Columna A: <code className="bg-slate-200 px-1 rounded">número de caso</code> (valores numéricos ascendentes)</li>
          <li>Columna B: <code className="bg-slate-200 px-1 rounded">AP</code> (valores: Ta, Tis, T1, T2, T3, T4)</li>
        </ul>
      </div>

    </div>
  );
};

export default UploadScreen;