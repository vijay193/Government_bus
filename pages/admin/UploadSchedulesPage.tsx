import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import type { ParsedSchedule, SeatLayout } from '../../types';
import { UploadCloud, ListChecks, AlertTriangle, CheckCircle, FileUp, Download, FileText } from 'lucide-react';
import { BackButton } from '../../components/common/BackButton';

type UploadMode = 'csv' | 'text';

// Helper to download a CSV template
const downloadCsvTemplate = () => {
    const header = "scheduleIdentifier,busName,seatLayout,bookingEnabled,stopOrder,stopName,arrivalTime,departureTime,fareFromOrigin\n";
    const example1 = "RTK-CHD-01,Haryana Roadways,2x2,true,0,Rohtak,,08:00,0\n";
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

const parseScheduleData = (text: string): ParsedSchedule[] => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error("Input must have a header and at least one data row.");
    
    const headers = lines[0].split(',').map(h => h.trim());
    const requiredHeaders = ["scheduleIdentifier", "busName", "seatLayout", "bookingEnabled", "stopOrder", "stopName", "arrivalTime", "departureTime", "fareFromOrigin"];
    if(!requiredHeaders.every(h => headers.includes(h))) {
        throw new Error(`Input is missing one of the required headers: ${requiredHeaders.join(', ')}`);
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
        if (!id) {
            console.warn("Skipping row with missing scheduleIdentifier:", row);
            continue;
        }
        if (!schedulesMap.has(id)) {
            schedulesMap.set(id, {
                id: id,
                busName: row.busName,
                seatLayout: row.seatLayout as SeatLayout,
                bookingEnabled: row.bookingEnabled?.toLowerCase() === 'true',
                stops: []
            });
        }
        schedulesMap.get(id)!.stops.push({
            stopOrder: parseInt(row.stopOrder, 10),
            stopName: row.stopName,
            arrivalTime: row.arrivalTime === 'null' || !row.arrivalTime ? null : row.arrivalTime,
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

            if (isAValid && isBValid) return orderA - orderB;
            if (isAValid) return -1;
            if (isBValid) return 1;
            return 0;
        });
        finalSchedules.push(schedule);
    });
    
    return finalSchedules;
};

const SchedulePreview: React.FC<{ schedules: ParsedSchedule[] }> = ({ schedules }) => (
    <div className="upload-schedules__preview">
        <h3 className="upload-schedules__preview-title"><ListChecks /> Parsed Schedules Preview</h3>
        <div className="upload-schedules__preview-list">
            {schedules.map((schedule, index) => (
                <div key={schedule.id || index} className="preview-schedule-card">
                    <h4 className="preview-schedule-card__title">{schedule.busName} ({schedule.seatLayout})</h4>
                    <p className="preview-schedule-card__meta">ID: <span className="preview-schedule-card__meta-id">{schedule.id}</span></p>
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
    const [mode, setMode] = useState<UploadMode>('csv');
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
        const fileInput = document.getElementById('csv-upload-input') as HTMLInputElement;
        if(fileInput) {
            fileInput.value = '';
        }
    };

    const handleModeChange = (newMode: UploadMode) => {
        setMode(newMode);
        clearState();
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
                const schedules = parseScheduleData(text);
                setParsedSchedules(schedules);
            } catch (err) {
                setError(`CSV parsing failed: ${err instanceof Error ? err.message : String(err)}`);
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const handleParseFromText = () => {
        if (!textInput.trim()) {
            setError("Text input cannot be empty.");
            return;
        }
        setIsLoading(true);
        setParsedSchedules([]);
        setError(null);
        setSuccess(null);
        
        try {
            const schedules = parseScheduleData(textInput);
            setParsedSchedules(schedules);
        } catch (err) {
            setError(`Text parsing failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleSubmitToBackend = async () => {
        if (!user || parsedSchedules.length === 0) return;
        setIsSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            const response = await api.batchUploadSchedules(parsedSchedules);
            setSuccess(response.message);
            clearState();
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
                        <UploadCloud /> Upload New Schedules
                    </h1>
                    <p className="admin-page-header__subtitle" style={{ marginBottom: 0, marginTop: '0.25rem' }}>
                        Efficiently add new bus routes by uploading a structured file or pasting text.
                    </p>
                </div>
            </div>
            
            <div className="upload-schedules__tabs">
                <button onClick={() => handleModeChange('csv')} className={`upload-schedules__tab-btn ${mode === 'csv' ? 'upload-schedules__tab-btn--active' : ''}`}><FileUp size={20}/> CSV Upload</button>
                <button onClick={() => handleModeChange('text')} className={`upload-schedules__tab-btn ${mode === 'text' ? 'upload-schedules__tab-btn--active' : ''}`}><FileText size={20}/> Paste Text</button>
            </div>
            
            <div className="upload-schedules__content">
                {mode === 'csv' ? (
                     <div>
                        <p className="admin-page-header__subtitle" style={{marginBottom: '1rem'}}>Upload a CSV file with schedule data. The file must contain specific headers to be parsed correctly.</p>
                        <div className="upload-schedules__file-upload-actions">
                            <Button onClick={downloadCsvTemplate} variant="secondary">
                                <Download size={18} /> Download Template
                            </Button>
                            <label>
                                <span style={{display: 'none'}}>Choose file</span>
                                <input type="file" id="csv-upload-input" onChange={handleFileUpload} accept=".csv" className="upload-schedules__file-input"/>
                            </label>
                        </div>
                    </div>
                ) : (
                    <div>
                        <label htmlFor="scheduleText" className="input-label">Paste schedule data below (must include header row):</label>
                        <textarea 
                            id="scheduleText" 
                            rows={10} 
                            value={textInput} 
                            onChange={e => setTextInput(e.target.value)} 
                            className="upload-schedules__textarea" 
                            placeholder={"scheduleIdentifier,busName,seatLayout,bookingEnabled,stopOrder,stopName,arrivalTime,departureTime,fareFromOrigin\nNAL-GUW-01,Bus NAL-GUW-01,2x2,True,0,Nalbari,,06:30,0..."}
                        />
                        <Button onClick={handleParseFromText} isLoading={isLoading} style={{marginTop: '1rem'}}>
                            Parse Text
                        </Button>
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
