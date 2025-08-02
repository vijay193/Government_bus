import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import type { ParsedSchedule } from '../../types';
import { UploadCloud, FileText, Bot, ListChecks, AlertTriangle, CheckCircle, FileUp, Download } from 'lucide-react';

type UploadMode = 'text' | 'csv';

// Helper to download a CSV template
const downloadCsvTemplate = () => {
    const header = "scheduleIdentifier,busName,seatLayout,bookingEnabled,stopOrder,stopName,arrivalTime,departureTime,fareFromOrigin\n";
    const example1 = "RTK-CHD-01,Haryana Roadways,2x2,true,0,Rohtak,null,08:00,0\n";
    const example2 = "RTK-CHD-01,Haryana Roadways,2x2,true,1,Gohana,09:00,09:05,50\n";
    const example3 = "RTK-CHD-01,Haryana Roadways,2x2,true,2,Panipat,10:00,10:10,100\n";
    const example4 = "RTK-CHD-01,Haryana Roadways,2x2,true,3,Chandigarh,12:00,12:00,250\n";
    const blob = new Blob([header, example1, example2, example3, example4], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "schedule_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

const SchedulePreview: React.FC<{ schedules: ParsedSchedule[] }> = ({ schedules }) => (
    <div className="upload-schedules__preview">
        <h3 className="upload-schedules__preview-title"><ListChecks /> Parsed Schedules Preview</h3>
        <div className="upload-schedules__preview-list">
            {schedules.map((schedule, index) => (
                <div key={schedule.id || index} className="preview-schedule-card">
                    <h4 className="preview-schedule-card__title">{schedule.busName} ({schedule.seatLayout})</h4>
                    <p className="preview-schedule-card__meta">ID: <span className="preview-schedule-card__meta-id">{schedule.id || 'N/A (AI Generated)'}</span></p>
                    <p className="preview-schedule-card__meta">Booking Enabled: {schedule.bookingEnabled ? 'Yes' : 'No'}</p>
                    <ol className="preview-schedule-card__stop-list">
                        {schedule.stops.map((stop, stopIndex) => (
                            <li key={stopIndex}>
                                <span className="font-semibold">{stop.stopName}</span> - 
                                Dep: {stop.departureTime} | 
                                Arr: {stop.arrivalTime || 'N/A'} | 
                                Fare: ₹{stop.fareFromOrigin}
                            </li>
                        ))}
                    </ol>
                </div>
            ))}
        </div>
    </div>
);

export const UploadSchedulesPage: React.FC = () => {
    const [mode, setMode] = useState<UploadMode>('text');
    const [textInput, setTextInput] = useState('');
    const [parsedSchedules, setParsedSchedules] = useState<ParsedSchedule[]>([]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    const { user } = useAuth();
    
    const clearState = () => {
        setTextInput('');
        setParsedSchedules([]);
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
        clearState();

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const scheduleSchema = {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING, description: "The unique identifier for the schedule, like 'RTK-CHD-01', if provided in the text. Can be omitted if not found." },
                    busName: { type: Type.STRING, description: "Name of the bus service, e.g., 'Haryana Roadways'" },
                    seatLayout: { type: Type.STRING, enum: ['2x2', '2x3', '2x1'] },
                    bookingEnabled: { type: Type.BOOLEAN },
                    stops: {
                        type: Type.ARRAY,
                        description: "List of stops in order.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                stopName: { type: Type.STRING },
                                arrivalTime: { type: Type.STRING, description: "Arrival time in HH:mm format. Should be null for the first stop." },
                                departureTime: { type: Type.STRING, description: "Departure time in HH:mm format." },
                                fareFromOrigin: { type: Type.NUMBER, description: "Cumulative fare from the origin stop." }
                            },
                            required: ['stopName', 'departureTime', 'fareFromOrigin']
                        }
                    }
                },
                required: ['busName', 'seatLayout', 'bookingEnabled', 'stops']
            };
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Parse the following bus schedule information into a structured JSON array. Also extract the schedule ID (e.g., 'RHK-JND-01') if it is mentioned. If no ID is mentioned, the 'id' field can be omitted. Infer seatLayout and bookingEnabled status. Ensure arrivalTime for the first stop is null. Text: \n\n${textInput}`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: { type: Type.ARRAY, items: scheduleSchema },
                }
            });

            const result = JSON.parse(response.text);
            setParsedSchedules(result);
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
                const requiredHeaders = ["scheduleIdentifier", "busName", "seatLayout", "bookingEnabled", "stopOrder", "stopName", "arrivalTime", "departureTime", "fareFromOrigin"];
                if(!requiredHeaders.every(h => headers.includes(h))) {
                    throw new Error(`CSV is missing one of the required headers: ${requiredHeaders.join(', ')}`);
                }
                
                const rows = lines.slice(1).map(line => {
                    const values = line.split(',');
                    return headers.reduce((obj, header, index) => {
                        obj[header] = values[index]?.trim();
                        return obj;
                    }, {} as Record<string, string>);
                });

                const schedulesMap = new Map<string, ParsedSchedule>();
                for (const row of rows) {
                    const id = row.scheduleIdentifier;
                    if (!schedulesMap.has(id)) {
                        schedulesMap.set(id, {
                            id: id,
                            busName: row.busName,
                            seatLayout: row.seatLayout as '2x2' | '2x3' | '2x1',
                            bookingEnabled: row.bookingEnabled?.toLowerCase() === 'true',
                            stops: []
                        });
                    }
                    schedulesMap.get(id)!.stops.push({
                        stopOrder: parseInt(row.stopOrder, 10),
                        stopName: row.stopName,
                        arrivalTime: row.arrivalTime === 'null' ? null : row.arrivalTime,
                        departureTime: row.departureTime,
                        fareFromOrigin: parseFloat(row.fareFromOrigin)
                    });
                }
                
                const finalSchedules: ParsedSchedule[] = [];
                schedulesMap.forEach(schedule => {
                    schedule.stops.sort((a, b) => {
                        const orderA = a.stopOrder;
                        const orderB = b.stopOrder;

                        const isAValid = typeof orderA === 'number' && !isNaN(orderA);
                        const isBValid = typeof orderB === 'number' && !isNaN(orderB);

                        if (isAValid && isBValid) {
                            return orderA - orderB; // Both are valid numbers
                        } else if (isAValid) {
                            return -1; // A is valid, B is not, so A comes first
                        } else if (isBValid) {
                            return 1; // B is valid, A is not, so B comes first
                        } else {
                            return 0; // Neither is valid, keep original order relative to each other
                        }
                    });
                    finalSchedules.push(schedule);
                });
                
                setParsedSchedules(finalSchedules);
            } catch (err) {
                setError(`CSV parsing failed: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsText(file);
    };
    
    const handleSubmitToBackend = async () => {
        if (!user || parsedSchedules.length === 0) return;
        setIsSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            const response = await api.batchUploadSchedules(parsedSchedules, user.id);
            setSuccess(response.message);
            setParsedSchedules([]);
            setTextInput('');
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unknown error occurred during submission.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Card>
            <h1 className="admin-page-header__title"><UploadCloud /> Upload New Schedules</h1>
            <p className="admin-page-header__subtitle">Efficiently add new bus routes using AI-powered text parsing or a structured CSV file.</p>
            
            <div className="upload-schedules__tabs">
                <button onClick={() => handleModeChange('text')} className={`upload-schedules__tab-btn ${mode === 'text' ? 'upload-schedules__tab-btn--active' : ''}`}><Bot size={20}/> AI Text Parser</button>
                <button onClick={() => handleModeChange('csv')} className={`upload-schedules__tab-btn ${mode === 'csv' ? 'upload-schedules__tab-btn--active' : ''}`}><FileText size={20}/> CSV Upload</button>
            </div>
            
            <div className="upload-schedules__content">
                {mode === 'text' ? (
                    <div>
                        <label htmlFor="scheduleText" className="input-label">Paste schedule details below:</label>
                        <textarea id="scheduleText" rows={10} value={textInput} onChange={e => setTextInput(e.target.value)} className="upload-schedules__textarea" placeholder="e.g., The bus with route ID GUR-AMB-69 from Gurgaon to Ambala leaves at 8 AM, stops at Panipat at 9 AM (fare 120), reaches Ambala at 11:30 AM (fare 250). The bus is 2x1 layout and allows booking."></textarea>
                        <Button onClick={handleParseWithAI} isLoading={isLoading} style={{marginTop: '1rem'}}>
                            <Bot /> Parse with AI
                        </Button>
                    </div>
                ) : (
                    <div>
                        <p className="admin-page-header__subtitle" style={{marginBottom: '1rem'}}>Upload a CSV file with schedule data. The file must contain specific headers to be parsed correctly.</p>
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

            {parsedSchedules.length > 0 && !isLoading && (
                <>
                    <SchedulePreview schedules={parsedSchedules} />
                    <div className="upload-schedules__submit-actions">
                        <Button variant="secondary" onClick={clearState} disabled={isSubmitting}>Clear</Button>
                        <Button onClick={handleSubmitToBackend} isLoading={isSubmitting}>
                            <FileUp size={18} /> Upload {parsedSchedules.length} Schedule(s) to Database
                        </Button>
                    </div>
                </>
            )}
        </Card>
    );
};