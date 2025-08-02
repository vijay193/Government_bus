import React, { useState, useEffect } from 'react';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { api } from '../services/api';
import type { BusLocation } from '../types';
import { MapPin, Search } from 'lucide-react';

const AnimatedMap: React.FC<{ location: BusLocation }> = ({ location }) => {
    // This is a simplified SVG map to simulate tracking.
    // A real implementation would use a library like Leaflet or Google Maps.
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress(prev => (prev >= 100 ? 0 : prev + 5));
        }, 1000);
        return () => clearInterval(interval);
    }, [location.busId]);
    
    // Simplified: assuming a straight line from first to last point
    const start = location.route[0];
    const end = location.route[location.route.length-1];
    
    const busX = 10 + (280 * progress / 100);
    const busY = 20 + (160 * progress / 100);


    return (
        <div className="tracking-page__map-container">
            <h3 className="tracking-page__map-title">Live Location for Bus {location.busId}</h3>
            <p className="tracking-page__map-updated">Last updated: {new Date(location.lastUpdated).toLocaleTimeString()}</p>
            <div className="tracking-page__map-svg-wrapper">
                <svg viewBox="0 0 300 200" className="tracking-page__map-svg">
                    {/* Route path */}
                    <path d="M 10 20 L 290 180" stroke="#CBD5E0" strokeWidth="3" strokeDasharray="5,5" />
                    
                    {/* Start and end points */}
                    <circle cx="10" cy="20" r="5" fill="#48BB78" />
                    <text x="15" y="18" fill="#4A5568" fontSize="10">Origin</text>
                    <circle cx="290" cy="180" r="5" fill="#F56565" />
                    <text x="235" y="185" fill="#4A5568" fontSize="10">Destination</text>

                    {/* Animated bus marker */}
                    <g transform={`translate(${busX}, ${busY})`}>
                         <circle cx="0" cy="0" r="8" fill="#4F46E5" stroke="white" strokeWidth="2" />
                         <circle cx="0" cy="0" r="12" fill="#4F46E5" opacity="0.5" className="tracking-page__bus-marker-ping" />
                    </g>
                </svg>
            </div>
        </div>
    );
};


export const TrackingPage: React.FC = () => {
    const [busId, setBusId] = useState('');
    const [location, setLocation] = useState<BusLocation | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleTrack = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setLocation(null);
        try {
            const result = await api.trackBus(busId);
            if (result) {
                setLocation(result);
            } else {
                setError('Bus not found or tracking is not available for this route.');
            }
        } catch (err) {
            setError('Failed to fetch tracking data. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container tracking-page">
            <Card className="tracking-page__card">
                <h2 className="tracking-page__title">
                    <MapPin /> Real-Time Bus Tracking
                </h2>
                <form onSubmit={handleTrack} className="tracking-page__form">
                    <Input id="busId" label="Bus ID or Route No." value={busId} onChange={(e) => setBusId(e.target.value)} placeholder="e.g., RTK-CHD-01" required />
                    <Button type="submit" isLoading={isLoading}>
                        <Search size={20} /> Track Bus
                    </Button>
                </form>

                {error && <p className="tracking-page__error">{error}</p>}
                
                {location && <AnimatedMap location={location} />}
            </Card>
        </div>
    );
};