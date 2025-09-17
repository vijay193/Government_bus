import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import type { ParsedBeneficiary } from '../../types';
import { UserPlus, FileText, ListChecks, AlertTriangle, CheckCircle, FileUp, Download, UserCheck } from 'lucide-react';
import { BackButton } from '../../components/common/BackButton';

type UploadMode = 'csv' | 'text';

// Helper to download a CSV template for beneficiary upload
const downloadCsvTemplate = () => {
    const header = "govtExamRegistrationNumber,phone,fullName,email,dob,password\n";
    const example1 = "EXAM12345,9876543210,Ramesh Kumar,ramesh@example.com,1998-05-20,pass123\n";
    const example2 = "EXAM67890,1234567890,Sunita Sharma,sunita@example.com,2001-11-15,\n";
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

const parseBeneficiaryData = (text: string): ParsedBeneficiary[] => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error("Input must have a header and at least one data row.");
    
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
        
        if (!row.govtExamRegistrationNumber || !row.phone || !row.fullName) {
             console.warn("Skipping row with missing required fields:", row);
            return null;
        }

        return {
            govtExamRegistrationNumber: row.govtExamRegistrationNumber,
            phone: row.phone,
            fullName: row.fullName,
            email: row.email || undefined,
            dob: row.dob || undefined,
            password: row.password || undefined,
        };
    }).filter(Boolean) as ParsedBeneficiary[];
    
    return beneficiaries;
};


export const BulkUserUploadPage: React.FC = () => {
    const [mode, setMode] = useState<UploadMode>('csv');
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
        const fileInput = document.getElementById('beneficiary-csv-upload') as HTMLInputElement;
        if (fileInput) {
            fileInput.value = '';
        }
    };

    const handleModeChange = (newMode: UploadMode) => {
        setMode(newMode);
        clearState();
    };

    const handleParseFromText = () => {
        if (!textInput.trim()) {
            setError("Text input cannot be empty.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setSuccess(null);
        setParsedBeneficiaries([]);

        try {
            const beneficiaries = parseBeneficiaryData(textInput);
            setParsedBeneficiaries(beneficiaries);
        } catch (err) {
            setError(`Text parsing failed: ${err instanceof Error ? err.message : String(err)}`);
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
                const beneficiaries = parseBeneficiaryData(text);
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
            const response = await api.bulkCreateBeneficiaries(parsedBeneficiaries);
            setSuccess(`${response.message} Created: ${response.created}, Updated: ${response.updated}, Skipped: ${response.skipped}.`);
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
            <div className="page-header-with-back" style={{ marginBottom: '1rem' }}>
                <BackButton to="/admin" />
                <div>
                    <h1 className="admin-page-header__title" style={{ marginBottom: 0 }}>
                        <UserPlus /> Bulk Beneficiary Upload
                    </h1>
                    <p className="admin-page-header__subtitle" style={{ marginBottom: 0, marginTop: '0.25rem' }}>
                        Create multiple password-less user accounts for beneficiaries. These users will log in using an OTP sent to their phone.
                    </p>
                </div>
            </div>
            
            <div className="upload-schedules__tabs">
                <button onClick={() => handleModeChange('csv')} className={`upload-schedules__tab-btn ${mode === 'csv' ? 'upload-schedules__tab-btn--active' : ''}`}><FileUp size={20}/> CSV Upload</button>
                <button onClick={() => handleModeChange('text')} className={`upload-schedules__tab-btn ${mode === 'text' ? 'upload-schedules__tab-btn--active' : ''}`}><FileText size={20}/> Paste Text</button>
            </div>
            
            <div className="upload-schedules__content">
                {mode === 'text' ? (
                    <div>
                        <label htmlFor="beneficiaryText" className="input-label">Paste beneficiary data below (must include header row):</label>
                        <textarea 
                            id="beneficiaryText" 
                            rows={10} 
                            value={textInput} 
                            onChange={e => setTextInput(e.target.value)} 
                            className="upload-schedules__textarea" 
                            placeholder={"govtExamRegistrationNumber,phone,fullName,email,dob,password\nEXAM12345,9876543210,Ramesh Kumar,ramesh@example.com,1998-05-20,strongPassword123"}
                        />
                        <Button onClick={handleParseFromText} isLoading={isLoading} style={{marginTop: '1rem'}}>
                            Parse Text
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
                                <input id="beneficiary-csv-upload" type="file" onChange={handleFileUpload} accept=".csv" className="upload-schedules__file-input"/>
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
                            <UserCheck size={18} /> Create/Update {parsedBeneficiaries.length} User Account(s)
                        </Button>
                    </div>
                </>
            )}
        </Card>
    );
};
