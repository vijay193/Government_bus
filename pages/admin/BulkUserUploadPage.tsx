
import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import type { ParsedBeneficiary } from '../../types';
import { UserPlus, FileText, Bot, ListChecks, AlertTriangle, CheckCircle, FileUp, Download, UserCheck } from 'lucide-react';

type UploadMode = 'text' | 'csv';

// Helper to download a CSV template for beneficiary upload
const downloadCsvTemplate = () => {
    const header = "govtExamRegistrationNumber,phone,fullName,email,dob\n";
    const example1 = "EXAM12345,9876543210,Ramesh Kumar,ramesh@example.com,1998-05-20\n";
    const example2 = "EXAM67890,1234567890,Sunita Sharma,sunita@example.com,2001-11-15\n";
    const blob = new Blob([header, example1, example2], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "beneficiary_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

const BeneficiaryPreview: React.FC<{ beneficiaries: ParsedBeneficiary[] }> = ({ beneficiaries }) => (
    <div className="upload-schedules__preview">
        <h3 className="upload-schedules__preview-title"><ListChecks /> Parsed Beneficiaries Preview</h3>
        <div className="upload-schedules__preview-list">
            {beneficiaries.map((user, index) => (
                <div key={index} className="preview-schedule-card">
                    <h4 className="preview-schedule-card__title">{user.fullName}</h4>
                    <p className="preview-schedule-card__meta">Phone: <span className="preview-schedule-card__meta-id">{user.phone}</span></p>
                    <p className="preview-schedule-card__meta">Reg No: <span className="preview-schedule-card__meta-id">{user.govtExamRegistrationNumber}</span></p>
                    <p className="preview-schedule-card__meta">Email: {user.email || 'N/A'}</p>
                    <p className="preview-schedule-card__meta">DOB: {user.dob || 'N/A'}</p>
                </div>
            ))}
        </div>
    </div>
);

export const BulkUserUploadPage: React.FC = () => {
    const [mode, setMode] = useState<UploadMode>('text');
    const [textInput, setTextInput] = useState('');
    const [parsedBeneficiaries, setParsedBeneficiaries] = useState<ParsedBeneficiary[]>([]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    const { user } = useAuth();
    
    const clearState = () => {
        setTextInput('');
        setParsedBeneficiaries([]);
        setError(null);
        setSuccess(null);
    };

    const handleModeChange = (newMode: UploadMode) => {
        setMode(newMode);
        clearState();
    };

    const handleParseWithAI = async () => {
        if (!textInput.trim()) {
            setError("Text input cannot be empty.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setSuccess(null);
        setParsedBeneficiaries([]);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const beneficiarySchema = {
                type: Type.OBJECT,
                properties: {
                    govtExamRegistrationNumber: { type: Type.STRING },
                    phone: { type: Type.STRING },
                    fullName: { type: Type.STRING },
                    email: { type: Type.STRING, description: "Optional: The user's email address." },
                    dob: { type: Type.STRING, description: "Optional: The user's date of birth in YYYY-MM-DD format." }
                },
                required: ['govtExamRegistrationNumber', 'phone', 'fullName']
            };
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Parse the following beneficiary information into a structured JSON array. Each object must contain 'govtExamRegistrationNumber', 'phone', and 'fullName'. The 'email' and 'dob' fields are optional. Text: \n\n${textInput}`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: { type: Type.ARRAY, items: beneficiarySchema },
                }
            });

            const result = JSON.parse(response.text);
            setParsedBeneficiaries(result);
        } catch (err) {
            setError(`AI parsing failed. Please check the text format or try again. Error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        clearState();
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const lines = text.trim().split(/\r?\n/);
                if (lines.length < 2) throw new Error("CSV must have a header and at least one data row.");
                
                const headers = lines[0].split(',').map(h => h.trim());
                const requiredHeaders = ["govtExamRegistrationNumber", "phone", "fullName"];
                if(!requiredHeaders.every(h => headers.includes(h))) {
                    throw new Error(`CSV is missing one of the required headers: ${requiredHeaders.join(', ')}`);
                }
                
                const beneficiaries: ParsedBeneficiary[] = lines.slice(1).map(line => {
                    const values = line.split(',');
                    const row = headers.reduce((obj, header, index) => {
                        obj[header] = values[index]?.trim();
                        return obj;
                    }, {} as Record<string, string>);
                    
                    return {
                        govtExamRegistrationNumber: row.govtExamRegistrationNumber,
                        phone: row.phone,
                        fullName: row.fullName,
                        email: row.email || undefined,
                        dob: row.dob || undefined,
                    };
                });
                
                setParsedBeneficiaries(beneficiaries);
            } catch (err) {
                setError(`CSV parsing failed: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsText(file);
    };
    
    const handleSubmitToBackend = async () => {
        if (!user || parsedBeneficiaries.length === 0) return;
        setIsSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            const response = await api.bulkCreateBeneficiaries(parsedBeneficiaries, user.id);
            setSuccess(`${response.message} Created: ${response.created}, Skipped: ${response.skipped}.`);
            setParsedBeneficiaries([]);
            setTextInput('');
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unknown error occurred during submission.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Card>
            <h1 className="admin-page-header__title"><UserPlus /> Bulk Beneficiary Upload</h1>
            <p className="admin-page-header__subtitle">Create multiple password-less user accounts for beneficiaries. These users will log in using an OTP sent to their phone.</p>
            
            <div className="upload-schedules__tabs">
                <button onClick={() => handleModeChange('text')} className={`upload-schedules__tab-btn ${mode === 'text' ? 'upload-schedules__tab-btn--active' : ''}`}><Bot size={20}/> AI Text Parser</button>
                <button onClick={() => handleModeChange('csv')} className={`upload-schedules__tab-btn ${mode === 'csv' ? 'upload-schedules__tab-btn--active' : ''}`}><FileText size={20}/> CSV Upload</button>
            </div>
            
            <div className="upload-schedules__content">
                {mode === 'text' ? (
                    <div>
                        <label htmlFor="beneficiaryText" className="input-label">Paste beneficiary details below:</label>
                        <textarea id="beneficiaryText" rows={10} value={textInput} onChange={e => setTextInput(e.target.value)} className="upload-schedules__textarea" placeholder="e.g., Name: Geeta Rani, Phone: 9988776655, Reg No: EXAM001. Name: Ajay Singh, Phone: 9988776644, Reg No: EXAM002, DOB: 1999-01-15"></textarea>
                        <Button onClick={handleParseWithAI} isLoading={isLoading} style={{marginTop: '1rem'}}>
                            <Bot /> Parse with AI
                        </Button>
                    </div>
                ) : (
                    <div>
                        <p className="admin-page-header__subtitle" style={{marginBottom: '1rem'}}>Upload a CSV file with beneficiary data. The file must contain `govtExamRegistrationNumber`, `phone`, and `fullName` headers.</p>
                        <div className="upload-schedules__file-upload-actions">
                            <Button onClick={downloadCsvTemplate} variant="secondary">
                                <Download size={18} /> Download Template
                            </Button>
                            <label>
                                <span style={{display: 'none'}}>Choose file</span>
                                <input type="file" onChange={handleFileUpload} accept=".csv" className="upload-schedules__file-input"/>
                            </label>
                        </div>
                    </div>
                )}
            </div>
            
            {isLoading && <div className="text-center py-4">Parsing data...</div>}

            {error && (
                <div className="upload-schedules__status-message status-error">
                    <AlertTriangle /> {error}
                </div>
            )}
            
            {success && (
                 <div className="upload-schedules__status-message status-success">
                    <CheckCircle /> {success}
                </div>
            )}

            {parsedBeneficiaries.length > 0 && !isLoading && (
                <>
                    <BeneficiaryPreview beneficiaries={parsedBeneficiaries} />
                    <div className="upload-schedules__submit-actions">
                        <Button variant="secondary" onClick={clearState} disabled={isSubmitting}>Clear</Button>
                        <Button onClick={handleSubmitToBackend} isLoading={isSubmitting}>
                            <UserCheck size={18} /> Create {parsedBeneficiaries.length} User Account(s)
                        </Button>
                    </div>
                </>
            )}
        </Card>
    );
};
