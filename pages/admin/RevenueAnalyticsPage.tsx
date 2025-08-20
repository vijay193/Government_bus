
import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import type { RevenueAnalyticsData, AnalyticsDataPoint } from '../../types';
import { Card } from '../../components/common/Card';
import { UserRole } from '../../types';
import { DollarSign, Ticket, TrendingUp, AlertCircle, Users } from 'lucide-react';

const COLORS = ['#4f46e5', '#16a34a', '#f59e0b']; // NORMAL, CHILD, SENIOR
const CATEGORY_ORDER: { [key: string]: number } = { 'NORMAL': 0, 'CHILD': 1, 'SENIOR': 2 };

const formatCurrency = (value: number | null | undefined) => {
    if (value === null || typeof value === 'undefined' || isNaN(value)) {
        return '₹0';
    }
    return `₹${value.toLocaleString('en-IN')}`;
};

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

    // Memoized data aggregation for charts and tables
    const districtChartData = useMemo(() => {
        if (!data?.byDistrict) return [];
        const districtMap = new Map<string, { district: string; normal: number; child: number; senior: number }>();
        data.byDistrict.forEach((item) => {
            if (!districtMap.has(item.district)) {
                districtMap.set(item.district, { district: item.district, normal: 0, child: 0, senior: 0 });
            }
            const districtData = districtMap.get(item.district)!;
            switch (item.type) {
                case 'NORMAL': districtData.normal += item.revenue; break;
                case 'CHILD': districtData.child += item.revenue; break;
                case 'SENIOR': districtData.senior += item.revenue; break;
            }
        });
        return Array.from(districtMap.values());
    }, [data?.byDistrict]);

    const routeDataAggregated = useMemo(() => {
        if (!data?.byRoute) return [];
        const routeMap = new Map<string, { route: string; revenue: number; tickets: number }>();
        data.byRoute.forEach((item) => {
            if (!routeMap.has(item.route)) {
                routeMap.set(item.route, { route: item.route, revenue: 0, tickets: 0 });
            }
            const routeData = routeMap.get(item.route)!;
            routeData.revenue += item.revenue;
            routeData.tickets += item.tickets;
        });
        return Array.from(routeMap.values()).sort((a,b) => b.revenue - a.revenue);
    }, [data?.byRoute]);


    if (isLoading) {
        return <div className="home-page__loader"><div className="home-page__spinner"></div></div>;
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

    const { summary, byCategory = [] } = data;

    const categoryChartData = byCategory.map((c: AnalyticsDataPoint) => ({
        name: c.type,
        value: c.revenue,
    }));

    return (
        <div className="space-y-8">
            <Card>
                <h1 className="admin-page-header__title"><TrendingUp /> Revenue Analytics</h1>
                <p className="admin-page-header__subtitle">
                    {user?.role === UserRole.ADMIN ? 'Global overview of all revenue streams.' : 'Performance overview for your assigned districts.'}
                </p>
            </Card>

            {/* Summary */}
            <div className="analytics-summary-grid">
                <AnalyticsSummaryCard title="Total Revenue" value={formatCurrency(summary.totalRevenue)} icon={<DollarSign className="analytics-summary-card__icon" />} />
                <AnalyticsSummaryCard title="Total Tickets" value={(summary.totalTickets || 0).toLocaleString('en-IN')} icon={<Ticket className="analytics-summary-card__icon" />} />
                {byCategory.sort((a, b) => (CATEGORY_ORDER[a.type] || 99) - (CATEGORY_ORDER[b.type] || 99)).map((c: AnalyticsDataPoint) => (
                    <AnalyticsSummaryCard
                        key={c.type}
                        title={`${c.type} Revenue`}
                        value={`${formatCurrency(c.revenue)} (${c.tickets} tickets)`}
                        icon={<Users className="analytics-summary-card__icon" style={{ color: COLORS[CATEGORY_ORDER[c.type] || 0] }} />}
                    />
                ))}
            </div>

            {/* Category-wise Pie Chart */}
            <Card>
                <h2 className="admin-dashboard__grid-title">Category-wise Revenue Share</h2>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie
                                data={categoryChartData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                outerRadius={120}
                                dataKey="value"
                            >
                                {categoryChartData.map((entry) => (
                                    <Cell key={`cell-${entry.name}`} fill={COLORS[CATEGORY_ORDER[entry.name as keyof typeof CATEGORY_ORDER] % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            {/* District-wise Stacked Bar */}
            <Card>
                <h2 className="admin-dashboard__grid-title">District Performance (by Category)</h2>
                <div style={{ width: '100%', height: 350 }}>
                    <ResponsiveContainer>
                        <BarChart data={districtChartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="district" tick={{ fontSize: 12 }} />
                            <YAxis tickFormatter={(value) => `₹${(value/1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            <Bar dataKey="normal" stackId="a" fill={COLORS[0]} name="Normal" />
                            <Bar dataKey="child" stackId="a" fill={COLORS[1]} name="Child" />
                            <Bar dataKey="senior" stackId="a" fill={COLORS[2]} name="Senior" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            {/* Route breakdown table */}
            {(user?.role === UserRole.ADMIN || user?.role === UserRole.SUB_ADMIN) && routeDataAggregated.length > 0 && (
                <Card>
                    <h2 className="admin-dashboard__grid-title">Route Breakdown</h2>
                    <div className="analytics-table-wrapper">
                        <table className="user-management__table">
                            <thead>
                                <tr>
                                    <th>Route</th>
                                    <th style={{textAlign: 'right'}}>Revenue</th>
                                    <th style={{textAlign: 'right'}}>Bookings</th>
                                </tr>
                            </thead>
                            <tbody>
                                {routeDataAggregated.map((r) => (
                                    <tr key={r.route}>
                                        <td>{r.route}</td>
                                        <td style={{textAlign: 'right'}}>{formatCurrency(r.revenue)}</td>
                                        <td style={{textAlign: 'right'}}>{r.tickets}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
};
