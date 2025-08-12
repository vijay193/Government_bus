import React, { useState, useEffect, useMemo } from 'react';
import { Mic, MessageSquare, Volume2, X, AlertTriangle } from 'lucide-react';
import type { Schedule, ParsedCommand } from '../../types';
import { useVoiceRecognition } from '../../hooks/useVoiceRecognition';
import { parseCommand } from '../../services/commandParser';
import { speak } from '../../services/textToSpeech';
import { api } from '../../services/api';

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  setSchedules: (schedules: Schedule[]) => void;
  setSearchError: (error: string | null) => void;
  setSearchLoading: (loading: boolean) => void;
  initialSchedules: Schedule[];
}

type AssistantStatus = 'idle' | 'listening' | 'processing' | 'responding';

export const VoiceAssistantModal: React.FC<VoiceAssistantModalProps> = ({
  isOpen,
  onClose,
  setSchedules,
  setSearchError,
  setSearchLoading,
  initialSchedules,
}) => {
  const [status, setStatus] = useState<AssistantStatus>('idle');
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantResponse, setAssistantResponse] = useState('');
  const [contextSchedules, setContextSchedules] = useState<Schedule[]>(initialSchedules);

  const {
    isListening,
    transcript,
    error: recognitionError,
    startListening,
    hasRecognitionSupport,
  } = useVoiceRecognition();

  useEffect(() => {
    if (isOpen) {
        setContextSchedules(initialSchedules);
        setAssistantResponse("Hello! How can I help you find a bus today?");
        setUserTranscript('');
    }
  }, [isOpen, initialSchedules]);
  
  useEffect(() => {
    if (isListening) {
      setStatus('listening');
      setAssistantResponse('Listening...');
    } else {
      if (status === 'listening') {
          setStatus('idle');
      }
    }
  }, [isListening, status]);

  useEffect(() => {
    if (transcript) {
      setUserTranscript(transcript);
      setStatus('processing');
      processCommand(transcript);
    }
  }, [transcript]);

  const processCommand = async (commandText: string) => {
    setAssistantResponse('Processing your request...');
    const parsedCommand = parseCommand(commandText);

    switch (parsedCommand.type) {
      case 'SEARCH_ROUTE':
        await handleSearchRoute(parsedCommand);
        break;
      case 'SEARCH_DISTRICT':
        await handleSearchDistrict(parsedCommand);
        break;
      case 'FILTER_FARE_LOW':
        handleFilter('fare');
        break;
      case 'FILTER_STOPS_LOW':
        handleFilter('stops');
        break;
      case 'FILTER_BY_TIME':
        handleFilterByTime(parsedCommand);
        break;
      case 'CHECK_VIA':
        handleCheckVia(parsedCommand);
        break;
      case 'RESET':
        handleReset();
        break;
      default:
        handleUnknownCommand();
        break;
    }
  };

  const respond = (text: string, closeAfter: boolean = false) => {
      setAssistantResponse(text);
      speak(text, 'hi-IN');
      setStatus('responding');
      if (closeAfter) {
          setTimeout(() => onClose(), 4000);
      }
  };

  const handleSearchRoute = async (command: ParsedCommand) => {
    const { origin, destination } = command.payload!;
    if (!origin || !destination) {
      respond("Please specify both an origin and a destination.");
      return;
    }
    respond(`Searching for buses from ${origin} to ${destination}.`);
    setSearchLoading(true);
    setSearchError(null);
    try {
      const results = await api.getSchedulesByRoute(origin, destination);
      setSchedules(results);
      setContextSchedules(results);
      if (results.length > 0) {
        respond(`I found ${results.length} buses. The results are on your screen.`, true);
      } else {
        setSearchError(`No buses found for the route: ${origin} to ${destination}.`);
        respond(`Sorry, I could not find any buses from ${origin} to ${destination}.`, true);
      }
    } catch (err) {
      setSearchError("Failed to fetch schedules.");
      respond("Sorry, there was an error searching for buses.", true);
    } finally {
      setSearchLoading(false);
    }
  };
  
  const handleSearchDistrict = async (command: ParsedCommand) => {
     const { district } = command.payload!;
     if (!district) {
         respond("Please specify a district.");
         return;
     }
     respond(`Searching for buses starting from ${district} district.`);
     setSearchLoading(true);
     setSearchError(null);
     try {
         const results = await api.getSchedulesByDistrict(district);
         setSchedules(results);
         setContextSchedules(results);
         if (results.length > 0) {
             respond(`I found ${results.length} buses. They are now on your screen.`, true);
         } else {
             setSearchError(`No buses found for the district: ${district}.`);
             respond(`Sorry, I couldn't find any buses for ${district} district.`, true);
         }
     } catch (err) {
         setSearchError("Failed to fetch schedules.");
         respond("Sorry, there was an error searching for buses.", true);
     } finally {
         setSearchLoading(false);
     }
  };

  const handleFilter = (type: 'fare' | 'stops') => {
    if (contextSchedules.length === 0) {
      respond("Please search for a route first before applying filters.");
      return;
    }
    let sortedSchedules = [...contextSchedules];
    if (type === 'fare') {
      sortedSchedules.sort((a, b) => a.fare - b.fare);
      respond("Showing buses with the lowest fare.", true);
    } else { // stops
      sortedSchedules.sort((a, b) => a.via.length - b.via.length);
      respond("Showing buses with the fewest stops.", true);
    }
    setSchedules(sortedSchedules);
  };

  const handleFilterByTime = (command: ParsedCommand) => {
    const { startTime, endTime } = command.payload!;
    if (typeof startTime === 'undefined' || typeof endTime === 'undefined') {
        respond("Please specify a start and end time for the filter.");
        return;
    }

    if (contextSchedules.length === 0) {
        respond("Please search for a route first before filtering by time.");
        return;
    }

    const filteredSchedules = contextSchedules.filter(schedule => {
        const departureTime = schedule.departureTime; // "HH:mm"
        if (!departureTime) return false;

        const [hours] = departureTime.split(':').map(Number);
        
        if (startTime <= endTime) {
             return hours >= startTime && hours < endTime;
        } else { // Handle overnight times, e.g., 22:00 to 04:00
             return hours >= startTime || hours < endTime;
        }
    });

    if (filteredSchedules.length > 0) {
        setSchedules(filteredSchedules);
        respond(`I found ${filteredSchedules.length} buses between ${startTime}:00 and ${endTime}:00. The list is updated.`, true);
    } else {
        respond(`Sorry, I couldn't find any buses in that time range.`, true);
    }
};
  
    const handleCheckVia = (command: ParsedCommand) => {
        const stopName = command.payload?.stopName?.toLowerCase();
        if (!stopName) {
            respond("Please specify which stop you're asking about.");
            return;
        }

        if (contextSchedules.length === 0) {
            respond("Please search for a route first.");
            return;
        }

        const matchingBuses = contextSchedules.filter(s => 
            s.via.some(viaStop => viaStop.toLowerCase().includes(stopName))
        );

        if (matchingBuses.length > 0) {
            setSchedules(matchingBuses);
            respond(`Yes, ${matchingBuses.length} of the current buses go via ${command.payload?.stopName}. I've updated the list.`, true);
        } else {
            respond(`No, none of the current buses go via ${command.payload?.stopName}.`, true);
        }
    };

    const handleReset = () => {
        setSchedules([]);
        setContextSchedules([]);
        setSearchError(null);
        respond("Search has been reset.", true);
    };

  const handleUnknownCommand = () => {
    respond("Sorry, I didn't understand that. Please try one of the suggested commands.");
  };

  const microphoneButton = useMemo(() => {
    const iconMap = {
      idle: <Mic size={32} />,
      listening: <Mic size={32} className="voice-assistant__mic-icon--listening" />,
      processing: <div className="btn__spinner" style={{width: '32px', height: '32px'}}></div>,
      responding: <MessageSquare size={32} />,
    };
    return (
      <button
        className={`voice-assistant__mic-btn status--${status}`}
        onClick={startListening}
        disabled={status !== 'idle' && status !== 'responding'}
        aria-label="Start voice command"
      >
        {iconMap[status]}
      </button>
    );
  }, [status, startListening]);

  if (!isOpen) return null;
  
  if (!hasRecognitionSupport) {
      return (
        <div className="modal-overlay">
            <div className="modal-content modal-content--size-md voice-assistant-modal">
                <div className="voice-assistant__header">
                    <h3>Voice Assistant</h3>
                    <button onClick={onClose}><X size={24} /></button>
                </div>
                <div className="voice-assistant__body">
                     <div className="voice-assistant__unsupported">
                        <AlertTriangle size={48} />
                        <h3>Voice Recognition Not Supported</h3>
                        <p>Sorry, your browser does not support the Web Speech API required for voice commands.</p>
                     </div>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content--size-lg voice-assistant-modal">
        <div className="voice-assistant__header">
          <h3>Voice Assistant</h3>
          <button onClick={onClose}><X size={24} /></button>
        </div>
        <div className="voice-assistant__body">
            <div className="voice-assistant__main-controls">
                {microphoneButton}
                <div className="voice-assistant__display">
                    <p className="voice-assistant__transcript">
                        {userTranscript || '...'}
                    </p>
                    <div className="voice-assistant__response">
                        <p>{assistantResponse}</p>
                        {status === 'responding' && (
                            <button onClick={() => speak(assistantResponse, 'hi-IN')} className="voice-assistant__replay-btn">
                                <Volume2 size={18}/>
                            </button>
                        )}
                    </div>
                </div>
            </div>
            {recognitionError && <p className="voice-assistant__error">{recognitionError}</p>}
             <div className="voice-assistant__suggestions">
                <h4>Try saying:</h4>
                <ul>
                    <li>"Panipat se Karnal wali bus dikha"</li>
                    <li>"Sasti wali bus dikha"</li>
                    <li>"Subah 6 se 9 baje ki bus dikhao"</li>
                    <li>"Ye bus Panipat se jayegi?"</li>
                </ul>
            </div>
        </div>
      </div>
    </div>
  );
};
