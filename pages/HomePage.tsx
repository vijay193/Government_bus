import React, { useState, useEffect } from 'react';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { ScheduleCard } from '../components/bus/ScheduleCard';
import type { Schedule } from '../types';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { Search, Map, Route } from 'lucide-react';

export const HomePage: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<'route' | 'district'>('route');
  
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [district, setDistrict] = useState('');
  const [districts, setDistricts] = useState<string[]>([]);
  
  const { user } = useAuth();

  useEffect(() => {
    const fetchDistricts = async () => {
      try {
        const districtData = await api.getDistricts();
        setDistricts(districtData);
      } catch (err) {
        console.error("Failed to fetch districts", err);
        setError("Could not load list of available locations.");
      }
    };
    fetchDistricts();
  }, []);

  const handleTabChange = (type: 'route' | 'district') => {
    if (searchType !== type) {
      setSearchType(type);
      setSchedules([]);
      setError(null);
      setOrigin('');
      setDestination('');
      setDistrict('');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSchedules([]);

    try {
      let results: Schedule[] = [];
      if (searchType === 'district' && district) {
        results = await api.getSchedulesByDistrict(district);
      } else if (searchType === 'route' && origin && destination) {
        results = await api.getSchedulesByRoute(origin, destination);
      }
      setSchedules(results);
      if (results.length === 0) {
        setError("No buses found for the selected criteria.");
      }
    } catch (err) {
      setError("Failed to fetch schedules. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="container home-page">
        <div className="home-page__hero">
          <h1 className="home-page__title">Find Your <span className="home-page__title-highlight">Next Ride</span></h1>
          <p className="home-page__subtitle">Effortlessly browse schedules, find routes, and book your bus tickets with our clean and simple interface.</p>
        </div>

        <Card className="home-page__search-card">
          <div className="home-page__search-tabs">
            <button onClick={() => handleTabChange('route')} className={`home-page__search-tab ${searchType === 'route' ? 'home-page__search-tab--active' : ''}`}>
              <Route size={20} /> By Route
            </button>
            <button onClick={() => handleTabChange('district')} className={`home-page__search-tab ${searchType === 'district' ? 'home-page__search-tab--active' : ''}`}>
              <Map size={20} /> By District
            </button>
          </div>

          <form onSubmit={handleSearch} className="home-page__search-form">
            <div className="home-page__form-main">
              {searchType === 'route' ? (
                <div className="home-page__route-inputs">
                  <Input list="districts" id="origin" label="Origin" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g., Rohtak" required />
                  <Input list="districts" id="destination" label="Destination" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g., Panchkula" required />
                </div>
              ) : (
                <div className="input-wrapper">
                  <label htmlFor="district" className="input-label">District</label>
                  <select id="district" value={district} onChange={(e) => setDistrict(e.target.value)} required className="home-page__district-select">
                    <option value="">Select a District</option>
                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
              <datalist id="districts">
                {districts.map(d => <option key={d} value={d} />)}
              </datalist>

              <Button type="submit" isLoading={isLoading} className="home-page__search-button">
                <Search size={20} /> Search Buses
              </Button>
            </div>
          </form>
        </Card>

        <div className="home-page__results">
          {isLoading && (
              <div className="home-page__loader">
                  <div className="home-page__spinner"></div>
              </div>
          )}
          {error && <Card><p className="home-page__error">{error}</p></Card>}
          {schedules.map(schedule => <ScheduleCard key={schedule.id} schedule={schedule} userRole={user?.role} />)}
        </div>
      </div>
    </>
  );
};
