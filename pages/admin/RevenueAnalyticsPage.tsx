

import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import type { RevenueAnalyticsData, DetailedDistrictAnalytics, DetailedRouteAnalytics } from '../../types';
import { Card } from '../../components/common/Card';
import { UserRole } from '../../types';
import { TrendingUp, IndianRupee, Ticket, AlertCircle, TrendingDown, Users, Route, MapPin, XCircle } from 'lucide-react';

const COLORS = {
    'NORMAL': '#4f46e5',
    'CHILD': '#16a34a',
    'SENIOR': '#f59e0b',
    'REFUNDED': '#ef4444',
};
const CATEGORY_ORDER: { [key: string]: number } = { 'NORMAL': 0, 'CHILD': 1, 'SENIOR': 2 };

const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const formatNumber = (value: number) => value.toLocaleString('en-IN');


const AnalyticsSummaryCard: React.FC<{ title: string; value: React.ReactNode; icon: React.ReactNode, className?: string }> = ({ title, value, icon, className }) => (
    <Card className={`analytics-summary-card ${className || ''}`}>
        <div className={`analytics-summary-card__icon-wrapper ${className || ''}`}>
            {icon}
        </div>
        <div className="analytics-summary-card__content">
            <p className="analytics-summary-card__title">{title}</p>
            <p className="analytics-summary-card__value">{value}</p>
        </div>
    </Card>
);

const DetailedAnalyticsTable: React.FC<{ 
    data: (DetailedDistrictAnalytics | DetailedRouteAnalytics)[]; 
    type: 'district' | 'route' 
}> = ({ data, type }) => {
    
    if (data.length === 0) {
        return <p className="text-center p-4">No data available for this view.</p>
    }

    const keyField = type === 'district' ? 'district' : 'route';

    const revenueData = data.map(item => {
        const bookedNormal = Number(item.bookedNormalRevenue);
        const bookedChild = Number(item.bookedChildRevenue);
        const bookedSenior = Number(item.bookedSeniorRevenue);
        const cancelledNormal = Number(item.cancelledNormalRevenue);
        const cancelledChild = Number(item.cancelledChildRevenue);
        const cancelledSenior = Number(item.cancelledSeniorRevenue);
        
        const bookedTotal = bookedNormal + bookedChild + bookedSenior;
        const cancelledTotal = cancelledNormal + cancelledChild + cancelledSenior;

        return {
            key: (item as any)[keyField],
            bookedNormalRevenue: bookedNormal,
            bookedChildRevenue: bookedChild,
            bookedSeniorRevenue: bookedSenior,
            cancelledNormalRevenue: cancelledNormal,
            cancelledChildRevenue: cancelledChild,
            cancelledSeniorRevenue: cancelledSenior,
            bookedTotal,
            cancelledTotal,
            netNormal: bookedNormal - cancelledNormal,
            netChild: bookedChild - cancelledChild,
            netSenior: bookedSenior - cancelledSenior,
            netTotal: bookedTotal + cancelledTotal - cancelledTotal,
        };
    });

    const ticketData = data.map(item => {
    const bookedNormal = Number(item.bookedNormalTickets);
    const bookedChild = Number(item.bookedChildTickets);
    const bookedSenior = Number(item.bookedSeniorTickets);
    const cancelledNormal = Number(item.cancelledNormalTickets);
    const cancelledChild = Number(item.cancelledChildTickets);
    const cancelledSenior = Number(item.cancelledSeniorTickets);

    const bookedTotal = bookedNormal + bookedChild + bookedSenior;
    const cancelledTotal = cancelledNormal + cancelledChild + cancelledSenior;

    // Step 1: combine booked + cancelled (all positive)
    const combinedNormal = bookedNormal + cancelledNormal;
    const combinedChild = bookedChild + cancelledChild;
    const combinedSenior = bookedSenior + cancelledSenior;
    const combinedTotal = combinedNormal + combinedChild + combinedSenior;

    // Step 2: subtract cancelled once at the end
    const netNormal = combinedNormal - cancelledNormal;
    const netChild  = combinedChild  - cancelledChild;
    const netSenior = combinedSenior - cancelledSenior;
    const netTotal  = combinedTotal  - cancelledTotal;

    return {
        key: (item as any)[keyField],
        bookedNormalTickets: bookedNormal,
        bookedChildTickets: bookedChild,
        bookedSeniorTickets: bookedSenior,
        cancelledNormalTickets: cancelledNormal,
        cancelledChildTickets: cancelledChild,
        cancelledSeniorTickets: cancelledSenior,
        bookedTotal,
        cancelledTotal,
        netNormal,
        netChild,
        netSenior,
        netTotal,
    };
});

    
    const revenueTotals = useMemo(() => {
    const totals = revenueData.reduce((acc, row) => {
        acc.bookedNormalRevenue += row.bookedNormalRevenue;
        acc.bookedChildRevenue += row.bookedChildRevenue;
        acc.bookedSeniorRevenue += row.bookedSeniorRevenue;
        acc.bookedTotal += row.bookedTotal;

        acc.cancelledNormalRevenue += row.cancelledNormalRevenue;
        acc.cancelledChildRevenue += row.cancelledChildRevenue;
        acc.cancelledSeniorRevenue += row.cancelledSeniorRevenue;
        acc.cancelledTotal += row.cancelledTotal;

        return acc;
    }, {
        bookedNormalRevenue: 0, bookedChildRevenue: 0, bookedSeniorRevenue: 0, bookedTotal: 0,
        cancelledNormalRevenue: 0, cancelledChildRevenue: 0, cancelledSeniorRevenue: 0, cancelledTotal: 0,
        netNormal: 0, netChild: 0, netSenior: 0, netTotal: 0,
    });

    // now compute net properly
    totals.netNormal = totals.bookedNormalRevenue - totals.cancelledNormalRevenue;
    totals.netChild  = totals.bookedChildRevenue  - totals.cancelledChildRevenue;
    totals.netSenior = totals.bookedSeniorRevenue - totals.cancelledSeniorRevenue;
    totals.netTotal  = totals.bookedTotal - totals.cancelledTotal;

    return totals;
}, [revenueData]);


    const ticketTotals = useMemo(() => ticketData.reduce((acc, row) => {
        acc.bookedNormalTickets += row.bookedNormalTickets;
        acc.bookedChildTickets += row.bookedChildTickets;
        acc.bookedSeniorTickets += row.bookedSeniorTickets;
        acc.bookedTotal += row.bookedTotal;
        acc.cancelledNormalTickets += row.cancelledNormalTickets;
        acc.cancelledChildTickets += row.cancelledChildTickets;
        acc.cancelledSeniorTickets += row.cancelledSeniorTickets;
        acc.cancelledTotal += row.cancelledTotal;
        return acc;
    }, {
        bookedNormalTickets: 0, bookedChildTickets: 0, bookedSeniorTickets: 0, bookedTotal: 0,
        cancelledNormalTickets: 0, cancelledChildTickets: 0, cancelledSeniorTickets: 0, cancelledTotal: 0,
    }), [ticketData]);

    return (
        <div className="space-y-6">
            <div className="analytics-table-container">
                <h3 className="analytics-table-title">Revenue Breakdown</h3>
                <div className="user-management__table-wrapper">
                    <table className="user-management__table analytics-table--detailed">
                        <thead>
                            <tr>
                                <th rowSpan={2} className="sticky-col">{type === 'district' ? 'District' : 'Route'}</th>
                                <th colSpan={4}>Booked Revenue</th>
                                <th colSpan={4}>Cancelled Revenue (Refunds)</th>
                                <th colSpan={4}>Net Revenue</th>
                            </tr>
                            <tr>
                                <th>Normal</th><th>Child</th><th>Senior</th><th>Total</th>
                                <th>Normal</th><th>Child</th><th>Senior</th><th>Total</th>
                                <th>Normal</th><th>Child</th><th>Senior</th><th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {revenueData.map(d => (
                                <tr key={d.key}>
                                    <td className="sticky-col">{d.key}</td>
                                    <td>{formatCurrency(d.bookedNormalRevenue)}</td><td>{formatCurrency(d.bookedChildRevenue)}</td><td>{formatCurrency(d.bookedSeniorRevenue)}</td><td className="font-bold">{formatCurrency(d.bookedTotal)}</td>
                                    <td className="text-red-600">{formatCurrency(d.cancelledNormalRevenue)}</td><td className="text-red-600">{formatCurrency(d.cancelledChildRevenue)}</td><td className="text-red-600">{formatCurrency(d.cancelledSeniorRevenue)}</td><td className="font-bold text-red-600">{formatCurrency(d.cancelledTotal)}</td>
                                    <td>{formatCurrency(d.netNormal)}</td><td>{formatCurrency(d.netChild)}</td><td>{formatCurrency(d.netSenior)}</td><td className="font-bold">{formatCurrency(d.netTotal)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td className="sticky-col">Total</td>
                                <td>{formatCurrency(revenueTotals.bookedNormalRevenue)}</td>
                                <td>{formatCurrency(revenueTotals.bookedChildRevenue)}</td>
                                <td>{formatCurrency(revenueTotals.bookedSeniorRevenue)}</td>
                                <td className="font-bold">{formatCurrency(revenueTotals.bookedTotal)}</td>
                                <td className="text-red-600">{formatCurrency(revenueTotals.cancelledNormalRevenue)}</td>
                                <td className="text-red-600">{formatCurrency(revenueTotals.cancelledChildRevenue)}</td>
                                <td className="text-red-600">{formatCurrency(revenueTotals.cancelledSeniorRevenue)}</td>
                                <td className="font-bold text-red-600">{formatCurrency(revenueTotals.cancelledTotal)}</td>
                                <td>{formatCurrency(revenueTotals.netNormal)}</td>
                                <td>{formatCurrency(revenueTotals.netChild)}</td>
                                <td>{formatCurrency(revenueTotals.netSenior)}</td>
                                <td className="font-bold">{formatCurrency(revenueTotals.netTotal)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
            <div className="analytics-table-container">
                <h3 className="analytics-table-title">Ticket Count Breakdown</h3>
                 <div className="user-management__table-wrapper">
                    <table className="user-management__table analytics-table--detailed">
                       <thead>
                            <tr>
                                <th rowSpan={2} className="sticky-col">{type === 'district' ? 'District' : 'Route'}</th>
                                <th colSpan={4}>Booked Tickets</th>
                                <th colSpan={4}>Cancelled Tickets</th>
                            </tr>
                            <tr>
                                <th>Normal</th><th>Child</th><th>Senior</th><th>Total</th>
                                <th>Normal</th><th>Child</th><th>Senior</th><th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ticketData.map(d => (
                                <tr key={d.key}>
                                    <td className="sticky-col">{d.key}</td>
                                    <td>{formatNumber(d.bookedNormalTickets)}</td><td>{formatNumber(d.bookedChildTickets)}</td><td>{formatNumber(d.bookedSeniorTickets)}</td><td className="font-bold">{formatNumber(d.bookedTotal)}</td>
                                    <td className="text-red-600">{formatNumber(d.cancelledNormalTickets)}</td><td className="text-red-600">{formatNumber(d.cancelledChildTickets)}</td><td className="text-red-600">{formatNumber(d.cancelledSeniorTickets)}</td><td className="font-bold text-red-600">{formatNumber(d.cancelledTotal)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td className="sticky-col">Total</td>
                                <td>{formatNumber(ticketTotals.bookedNormalTickets)}</td>
                                <td>{formatNumber(ticketTotals.bookedChildTickets)}</td>
                                <td>{formatNumber(ticketTotals.bookedSeniorTickets)}</td>
                                <td className="font-bold">{formatNumber(ticketTotals.bookedTotal)}</td>
                                <td className="text-red-600">{formatNumber(ticketTotals.cancelledNormalTickets)}</td>
                                <td className="text-red-600">{formatNumber(ticketTotals.cancelledChildTickets)}</td>
                                <td className="text-red-600">{formatNumber(ticketTotals.cancelledSeniorTickets)}</td>
                                <td className="font-bold text-red-600">{formatNumber(ticketTotals.cancelledTotal)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
}

export const RevenueAnalyticsPage: React.FC = () => {
    const [data, setData] = useState<RevenueAnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'district' | 'route'>('district');
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
        if (!data) return null;
        
        const bookedRevenueByCategory = data.byCategory
            .filter(c => Number(c.grossRevenue) > 0)
            .map(c => ({ name: c.type, value: Number(c.grossRevenue) }))
            .sort((a, b) => CATEGORY_ORDER[a.name] - CATEGORY_ORDER[b.name]);

        const refundedRevenueByCategory = data.byCategory
            .filter(c => Number(c.refundedRevenue) > 0)
            .map(c => ({ name: c.type, value: Number(c.refundedRevenue) }))
            .sort((a, b) => CATEGORY_ORDER[a.name] - CATEGORY_ORDER[b.name]);
        
        const topDistrictsByRevenue = [...data.byDistrict]
            .map(d => {
                const gross = Number(d.bookedNormalRevenue) + Number(d.bookedChildRevenue) + Number(d.bookedSeniorRevenue);
                const refunded = Number(d.cancelledNormalRevenue) + Number(d.cancelledChildRevenue) + Number(d.cancelledSeniorRevenue);
                return {
                    name: d.district,
                    'Net Revenue': gross - refunded,
                    'Refunded': refunded,
                    'Gross': gross,
                };
            })
            .sort((a, b) => b.Gross - a.Gross)
            .slice(0, 5);


        return { bookedRevenueByCategory, refundedRevenueByCategory, topDistrictsByRevenue };
    }, [data]);


    if (isLoading) return <div className="home-page__loader"><div className="home-page__spinner"></div></div>;
    if (error) return <Card><div className="auth-form__error"><AlertCircle /><p>{error}</p></div></Card>;
    if (!data || !data.summary || !chartData) return <Card><p className="text-center">No analytics data available.</p></Card>;

    const { summary, byDistrict = [], byRoute = [] } = data;

    return (
        <div className="space-y-6">
            <Card>
                <h1 className="admin-page-header__title"><TrendingUp /> Revenue Analytics</h1>
                <p className="admin-page-header__subtitle">
                    {user?.role === UserRole.ADMIN ? 'Global overview of all revenue streams.' : 'Performance overview for your assigned districts.'}
                </p>
            </Card>

            <div className="analytics-summary-grid">
                <AnalyticsSummaryCard title="Total Booked Revenue" value={formatCurrency(summary.grossRevenue)} icon={<IndianRupee />} className="summary-card--gross"/>
                <AnalyticsSummaryCard title="Total Cancelled (Refunds)" value={formatCurrency(summary.refundedRevenue)} icon={<TrendingDown />} className="summary-card--refunded"/>
                <AnalyticsSummaryCard title="Net Revenue" value={formatCurrency(summary.netRevenue)} icon={<IndianRupee />} className="summary-card--net"/>
                <AnalyticsSummaryCard title="Booked Tickets" value={formatNumber(summary.bookedTickets)} icon={<Ticket />} className="summary-card--booked"/>
                <AnalyticsSummaryCard title="Cancelled Tickets" value={formatNumber(summary.cancelledTickets)} icon={<XCircle />} className="summary-card--cancelled"/>
            </div>

            <Card>
                <h2 className="admin-dashboard__grid-title">Visual Overview</h2>
                <div className="analytics-grid-layout">
                    <div className="analytics-chart-container">
                        <h3 className="analytics-card-section-title">Booked Revenue by Type</h3>
                        <ResponsiveContainer width="100%" height={250}>
                             <PieChart>
                                <Pie data={chartData.bookedRevenueByCategory} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} outerRadius={80} dataKey="value">
                                    {chartData.bookedRevenueByCategory.map((entry) => <Cell key={`cell-${entry.name}`} fill={COLORS[entry.name]} />)}
                                </Pie>
                                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                     <div className="analytics-chart-container">
                        <h3 className="analytics-card-section-title">Refunded Revenue by Type</h3>
                         <ResponsiveContainer width="100%" height={250}>
                             <PieChart>
                                <Pie data={chartData.refundedRevenueByCategory} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} outerRadius={80} dataKey="value">
                                    {chartData.refundedRevenueByCategory.map((entry) => <Cell key={`cell-${entry.name}`} fill={COLORS[entry.name]} />)}
                                </Pie>
                                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                 <div className="analytics-chart-container" style={{ marginTop: '2rem' }}>
                    <h3 className="analytics-card-section-title">Top Districts by Revenue</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData.topDistrictsByRevenue} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tickFormatter={(value) => `₹${Number(value) / 1000}k`} />
                            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                            <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name]} />
                            <Legend />
                            <Bar dataKey="Net Revenue" stackId="a" fill={COLORS.NORMAL} />
                            <Bar dataKey="Refunded" stackId="a" fill={COLORS.REFUNDED} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <Card>
                <div className="upload-schedules__tabs">
                    <button onClick={() => setActiveTab('district')} className={`upload-schedules__tab-btn ${activeTab === 'district' ? 'upload-schedules__tab-btn--active' : ''}`}><MapPin size={20}/> By District</button>
                    <button onClick={() => setActiveTab('route')} className={`upload-schedules__tab-btn ${activeTab === 'route' ? 'upload-schedules__tab-btn--active' : ''}`}><Route size={20}/> By Route</button>
                </div>
                 <div className="upload-schedules__content">
                    {activeTab === 'district' ? (
                        <DetailedAnalyticsTable data={byDistrict} type="district" />
                    ) : (
                        <DetailedAnalyticsTable data={byRoute} type="route" />
                    )}
                 </div>
            </Card>

        </div>
    );
};