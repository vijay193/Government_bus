import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import type { PassCard } from '../types';
import { Card } from '../components/common/Card';
import { AlertCircle, Shield, ShieldCheck, ArrowRight, Calendar, User, GitCommitHorizontal, KeyRound, Star } from 'lucide-react';
import { BackButton } from '../components/common/BackButton';

const PassCardDisplay: React.FC<{ pass: PassCard }> = ({ pass }) => {
    const isExpired = new Date(pass.expiryDate) < new Date();
    
    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-GB'); // DD/MM/YYYY
    }

    return (
        <div className="pass-card-container">
            <div className={`pass-card ${isExpired ? 'pass-card--expired' : ''}`}>
                
                {isExpired && <div className="pass-card__expired-watermark">EXPIRED</div>}

                <div className="pass-card__header">
                    <Shield size={40} className="pass-card__emblem" />
                    <div>
                        <h2 className="pass-card__title">HARYANA ROADWAYS</h2>
                        <p className="pass-card__subtitle">Student Identity Pass</p>
                    </div>
                </div>

                <div className="pass-card__body">
                    <div className="pass-card__photo-wrapper">
                        <img src={pass.userImage} alt={pass.fullName} className="pass-card__photo" />
                    </div>
                    <div className="pass-card__details-grid">
                        <div className="pass-card__detail-item">
                            <label>Name</label>
                            <span>{pass.fullName}</span>
                        </div>
                        <div className="pass-card__detail-item">
                            <label>S/O</label>
                            <span>{pass.fatherName}</span>
                        </div>
                         <div className="pass-card__detail-item">
                            <label>D.O.B</label>
                            <span>{formatDate(pass.dob)}</span>
                        </div>
                    </div>
                </div>

                <div className="pass-card__number-section">
                     <label>Pass Number</label>
                     <span>{pass.passCardNumber}</span>
                </div>
                
                <div className="pass-card__route-section">
                    <div className="pass-card__route-point">
                        <label>From</label>
                        <span>{pass.origin}</span>
                    </div>
                    <ArrowRight size={24} className="pass-card__route-arrow"/>
                    <div className="pass-card__route-point">
                        <label>To</label>
                        <span>{pass.destination}</span>
                    </div>
                </div>


                <div className="pass-card__footer">
                    <div className="pass-card__detail-item">
                        <label>Date of Expiry</label>
                        <span>{formatDate(pass.expiryDate)}</span>
                    </div>
                    <div className="pass-card__signature">
                        <label>Authorised Signatory</label>
                    </div>
                    <div className="pass-card__hologram"></div>
                </div>
            </div>
        </div>
    )
}


export const PassCardPage: React.FC = () => {
    const { user } = useAuth();
    const [passCard, setPassCard] = useState<PassCard | null>(null);
    const [isLoading, setIsLoading] =useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        
        const fetchPassCard = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const data = await api.getPassCardForUser(user.id);
                setPassCard(data);
            } catch (err) {
                const message = err instanceof Error ? err.message : "An unknown error occurred.";
                setError(`Failed to load your pass card. ${message}`);
            } finally {
                setIsLoading(false);
            }
        }
        
        fetchPassCard();
    }, [user]);

    if (isLoading) {
        return (
            <div className="home-page__loader">
                <div className="home-page__spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <Card>
                <div className="auth-form__error" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <AlertCircle size={24} /> <p>{error}</p>
                </div>
            </Card>
        );
    }
    
    return (
        <div className="pass-card-page">
            <div className="page-header-with-back">
                <BackButton />
            </div>
            { passCard ? (
                <PassCardDisplay pass={passCard} />
            ) : (
                <Card>
                    <p className="text-center" style={{padding: '2rem'}}>You do not have a pass card associated with your account.</p>
                </Card>
            )}
        </div>
    );
};
