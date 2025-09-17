import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { api } from '../services/api';
import type { BusLocation } from '../types';
import { MapPin, Search, CheckCircle, CircleDot, Hourglass, BusFront } from 'lucide-react';

const RouteDisplay: React.FC<{ location: BusLocation }> = ({ location }) => {
    const { routeStops, currentStopIndex, isAtStop } = location;

    if (!routeStops || routeStops.length === 0) {
        return <p className="tracking-page__error">Route information is not available for this bus.</p>;
    }

    const origin = routeStops[0].name;
    const destination = routeStops[routeStops.length - 1].name;
    
    let currentStatusText = '';
    const lastStopIndex = routeStops.length - 1;

    if (currentStopIndex === -1) {
        currentStatusText = `Bus has not started the journey from ${origin}.`;
    } else if (currentStopIndex === lastStopIndex && isAtStop) {
        currentStatusText = `Journey completed. Bus is at the final destination: ${destination}.`;
    } else if (isAtStop) {
        currentStatusText = `Bus is currently at ${routeStops[currentStopIndex].name}.`;
    } else { // on the way
        const nextStopName = routeStops[currentStopIndex + 1]?.name || destination;
        currentStatusText = `On the way to ${nextStopName}.`;
    }

    return (
        <div className="tracking-page__route-container">
            <h3 className="tracking-page__map-title">Journey: {origin} → {destination}</h3>
            <div className="tracking-page__current-status">
                <BusFront size={20} />
                <span>{currentStatusText}</span>
            </div>
            <p className="tracking-page__map-updated">Last updated: {new Date(location.lastUpdated).toLocaleTimeString()}</p>
            
            <div className="tracking-page__route-list">
                {routeStops.map((stop, index) => {
                    let status: 'completed' | 'current' | 'upcoming' = 'upcoming';
                    if (index < currentStopIndex) {
                        status = 'completed';
                    } else if (index === currentStopIndex) {
                        status = 'current';
                    }

                    // If journey is completed, the final stop is also marked as completed
                    if (currentStopIndex === lastStopIndex && index === lastStopIndex) {
                        status = 'completed';
                    }

                    const isLastItem = index === routeStops.length - 1;

                    return (
                        <div key={index} className="tracking-page__route-stop-wrapper">
                            <div className={`tracking-page__route-stop stop--${status}`}>
                                <div className="tracking-page__stop-icon">
                                    {status === 'completed' && <CheckCircle size={24} />}
                                    {status === 'current' && <CircleDot size={24} />}
                                    {status === 'upcoming' && <Hourglass size={24} />}
                                </div>
                                <div className="tracking-page__stop-details">
                                    <span className="tracking-page__stop-name">{stop.name}</span>
                                    <span className="tracking-page__stop-time">
                                        {stop.arrival && `Arr: ${stop.arrival}`}
                                        {stop.arrival && stop.departure && ' | '}
                                        {stop.departure && `Dep: ${stop.departure}`}
                                    </span>
                                </div>
                                {status === 'completed' && <span className="tracking-page__stop-status-text">Completed</span>}
                                {status === 'current' && isAtStop && <span className="tracking-page__stop-status-text">Current</span>}
                                {status === 'current' && !isAtStop && <span className="tracking-page__stop-status-text">Departed</span>}
                            </div>
                            {!isLastItem && (
                                <div className={`tracking-page__route-connector connector--${index < currentStopIndex ? 'completed' : 'upcoming'}`}>
                                    {index === currentStopIndex && !isAtStop && (
                                        <BusFront className="tracking-page__bus-icon" size={20} />
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


export const TrackingPage: React.FC = () => {
    const routerLocation = useLocation();
    const [busId, setBusId] = useState(routerLocation.state?.busId || '');
    const [location, setLocation] = useState<BusLocation | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trackBusById = useCallback(async (idToTrack: string) => {
        if (!idToTrack) return;
        setIsLoading(true);
        setError(null);
        setLocation(null);
        try {
            const result = await api.trackBus(idToTrack);
            if (result) {
                setLocation(result);
            } else {
                setError('Bus not found or tracking is not available for this route.');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch tracking data. Please try again.';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (routerLocation.state?.busId) {
            trackBusById(routerLocation.state.busId);
        }
    }, [routerLocation.state?.busId, trackBusById]);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        trackBusById(busId);
    };

    return (
        <div className="container tracking-page">
            <Card className="tracking-page__card">
                <h2 className="tracking-page__title">
                    <MapPin /> Real-Time Bus Tracking
                </h2>
                <form onSubmit={handleFormSubmit} className="tracking-page__form">
                    <Input id="busId" label="Bus ID or Route No." value={busId} onChange={(e) => setBusId(e.target.value)} placeholder="e.g., RTK-CHD-01" required />
                    <Button type="submit" isLoading={isLoading}>
                        <Search size={20} /> Track Bus
                    </Button>
                </form>

                {error && <p className="tracking-page__error">{error}</p>}
                
                {location && <RouteDisplay location={location} />}
            </Card>
        </div>
    );
};