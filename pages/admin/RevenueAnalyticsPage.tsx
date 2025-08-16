
import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import type { RevenueAnalyticsData, DistrictRevenue } from '../../types';
import { Card } from '../../components/common/Card';
import { UserRole } from '../../types';
import { DollarSign, Ticket, Gift, TrendingUp, AlertCircle } from 'lucide-react';

const formatCurrency = (value: number | null | undefined) => `₹${(value || 0).toLocaleString('en-IN')}`;

const AnalyticsSummaryCard: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <Card className="analytics-summary-card">
        <div className="analytics-summary-card__content">
            <div className="analytics-summary-card__icon-wrapper">
                {icon}
            </div>
            <div>
                <p className="analytics-summary-card__title">{title}</p>
                <p className="analytics-summary-card__value">{value}</p>
            </div>
        </div>
    </Card>
);

export const RevenueAnalyticsPage: React.FC = () => {
    const [data, setData] = useState<RevenueAnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [chartDataKey, setChartDataKey] = useState<'revenue' | 'paidBookings' | 'freeTickets'>('revenue');
    const { user } = useAuth();

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            setIsLoading(true);
            setError(null);
            try {
                const result = await api.getRevenueAnalytics();
                setData(result);
            } catch (err) {
                setError('Failed to load revenue data. Please try again.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [user]);

    const chartData = useMemo(() => {
        return data?.byDistrict.map(d => ({
            name: d.district,
            revenue: d.revenue,
            paidBookings: d.paidBookings,
            freeTickets: d.freeTickets,
        })) || [];
    }, [data]);

    const highestRevenueDistrict = useMemo(() => {
        if (!data?.byDistrict || data.byDistrict.length === 0) return null;
        return data.byDistrict.reduce((max, d) => d.revenue > max.revenue ? d : max, data.byDistrict[0]);
    }, [data]);

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
                <div className="auth-form__error">
                    <AlertCircle size={24} />
                    <p>{error}</p>
                </div>
            </Card>
        );
    }

    if (!data || !data.summary) {
        return <Card><p className="text-center">No analytics data available.</p></Card>;
    }

    const { summary, byDistrict, byRoute } = data;

    return (
        <div className="space-y-8">
            <Card>
                <h1 className="admin-page-header__title"><TrendingUp />Revenue Analytics</h1>
                <p className="admin-page-header__subtitle">
                    {user?.role === UserRole.ADMIN ? 'Global overview of all revenue streams.' : 'Performance overview for your assigned districts.'}
                </p>
            </Card>
            
            <div className="analytics-summary-grid">
                <AnalyticsSummaryCard title="Total Revenue" value={formatCurrency(summary.totalRevenue)} icon={<DollarSign className="analytics-summary-card__icon" />} />
                <AnalyticsSummaryCard title="Paid Bookings" value={(summary.totalPaidBookings || 0).toLocaleString('en-IN')} icon={<Ticket className="analytics-summary-card__icon" />} />
                <AnalyticsSummaryCard title="Free Tickets" value={(summary.totalFreeTickets || 0).toLocaleString('en-IN')} icon={<Gift className="analytics-summary-card__icon" />} />
            </div>

            <Card>
                <h2 className="admin-dashboard__grid-title">District Performance</h2>
                {highestRevenueDistrict && (
                    <p className="admin-dashboard__grid-text">
                        <span className="font-semibold text-green-600">{highestRevenueDistrict.district}</span> is the highest-earning district.
                    </p>
                )}

                <div className="analytics-chart-controls">
                    <button onClick={() => setChartDataKey('revenue')} className={`analytics-chart-btn ${chartDataKey === 'revenue' ? 'analytics-chart-btn--active' : ''}`}>Revenue</button>
                    <button onClick={() => setChartDataKey('paidBookings')} className={`analytics-chart-btn ${chartDataKey === 'paidBookings' ? 'analytics-chart-btn--active' : ''}`}>Paid Bookings</button>
                    <button onClick={() => setChartDataKey('freeTickets')} className={`analytics-chart-btn ${chartDataKey === 'freeTickets' ? 'analytics-chart-btn--active' : ''}`}>Free Tickets</button>
                </div>

                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis tickFormatter={(value) => chartDataKey === 'revenue' ? `₹${value/1000}k` : value} tick={{ fontSize: 12 }} />
                            <Tooltip
                                cursor={{ fill: 'rgba(239, 246, 255, 0.7)' }}
                                contentStyle={{ backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px' }}
                                formatter={(value: number) => chartDataKey === 'revenue' ? formatCurrency(value) : (value || 0).toLocaleString()}
                            />
                            <Legend wrapperStyle={{ fontSize: '14px' }} />
                            <Bar dataKey={chartDataKey} name={chartDataKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <div className="analytics-grid">
                <Card>
                    <h2 className="admin-dashboard__grid-title">District Breakdown</h2>
                    <div className="analytics-table-wrapper">
                        <table className="user-management__table">
                             <thead>
                                <tr>
                                    <th>District</th>
                                    <th style={{textAlign: 'right'}}>Revenue</th>
                                    <th style={{textAlign: 'right'}}>Paid</th>
                                    <th style={{textAlign: 'right'}}>Free</th>
                                </tr>
                            </thead>
                            <tbody>
                                {byDistrict.map(d => (
                                    <tr key={d.district}>
                                        <td>{d.district}</td>
                                        <td style={{textAlign: 'right'}}>{formatCurrency(d.revenue)}</td>
                                        <td style={{textAlign: 'right'}}>{d.paidBookings}</td>
                                        <td style={{textAlign: 'right'}}>{d.freeTickets}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
                {user?.role === UserRole.SUB_ADMIN && byRoute && (
                     <Card>
                        <h2 className="admin-dashboard__grid-title">Route Breakdown</h2>
                        <div className="analytics-table-wrapper">
                             <table className="user-management__table">
                                <thead style={{position: 'sticky', top: 0}}>
                                    <tr>
                                        <th>Route</th>
                                        <th style={{textAlign: 'right'}}>Revenue</th>
                                        <th style={{textAlign: 'right'}}>Bookings</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {byRoute.map(r => (
                                        <tr key={r.scheduleId}>
                                            <td>
                                                <div className="user-management__user-name">{r.origin} to {r.destination}</div>
                                                <div className="user-management__user-contact-email">{r.busName}</div>
                                            </td>
                                            <td style={{textAlign: 'right'}}>{formatCurrency(r.revenue)}</td>
                                            <td style={{textAlign: 'right'}}>{r.totalBookings}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};
