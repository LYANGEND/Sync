import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, AlertCircle, ChevronRight, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import api from '../../utils/api';

interface DashboardStats {
  dailyRevenue: number;
  activeStudents: number;
  outstandingFees: number;
  recentPayments: {
    id: string;
    amount: number;
    method: string;
    createdAt: string;
    student: {
      firstName: string;
      lastName: string;
      class: { name: string };
    };
  }[];
}

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/dashboard/stats');
        setStats(response.data);
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user?.role !== 'PARENT') {
      fetchStats();
    }
  }, [user]);

  if (user?.role === 'PARENT') {
    return <Navigate to="/my-children" replace />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Welcome Section - Mobile */}
      <div className="lg:hidden">
        <h1 className="text-lg font-bold text-gray-800">Welcome back, {user?.fullName?.split(' ')[0]}!</h1>
        <p className="text-sm text-gray-500">Here's your school overview</p>
      </div>

      {/* Desktop Welcome */}
      <div className="hidden lg:block">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard Overview</h1>
        <p className="text-gray-500">Welcome back, here's what's happening today.</p>
      </div>

      {/* Quick Actions - Mobile Only */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 lg:hidden hide-scrollbar">
        <Link to="/students" className="flex-shrink-0 flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-full text-sm font-medium touch-btn">
          <Plus size={16} />
          <span>New Student</span>
        </Link>
        <Link to="/finance" className="flex-shrink-0 flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-full text-sm font-medium touch-btn">
          <Plus size={16} />
          <span>Record Payment</span>
        </Link>
        <Link to="/attendance" className="flex-shrink-0 flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-full text-sm font-medium touch-btn">
          <span>Mark Attendance</span>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <div className="stat-card touch-card">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="p-2 bg-green-100 text-green-600 rounded-lg">
              <TrendingUp size={18} className="sm:w-5 sm:h-5" />
            </div>
            <span className="text-[10px] sm:text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Today</span>
          </div>
          <p className="text-[10px] sm:text-xs text-gray-500 font-medium">Collection</p>
          <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">
            <span className="text-sm sm:text-base">ZMW</span> {stats?.dailyRevenue.toLocaleString() || '0'}
          </p>
        </div>

        <div className="stat-card touch-card">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
              <AlertCircle size={18} className="sm:w-5 sm:h-5" />
            </div>
            <span className="text-[10px] sm:text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Pending</span>
          </div>
          <p className="text-[10px] sm:text-xs text-gray-500 font-medium">Outstanding</p>
          <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">
            <span className="text-sm sm:text-base">ZMW</span> {stats?.outstandingFees.toLocaleString() || '0'}
          </p>
        </div>

        <div className="stat-card touch-card col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Users size={18} className="sm:w-5 sm:h-5" />
            </div>
            <span className="text-[10px] sm:text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Active</span>
          </div>
          <p className="text-[10px] sm:text-xs text-gray-500 font-medium">Students</p>
          <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">{stats?.activeStudents || '0'}</p>
        </div>
      </div>

      {/* Recent Payments */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Recent Payments</h2>
          <Link to="/finance" className="text-blue-600 text-sm font-medium flex items-center">
            View all <ChevronRight size={16} />
          </Link>
        </div>
        
        {/* Mobile List View */}
        <div className="lg:hidden divide-y divide-gray-100">
          {stats?.recentPayments.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No recent payments</div>
          ) : (
            stats?.recentPayments.slice(0, 5).map((payment) => (
              <div key={payment.id} className="mobile-list-item">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-semibold text-sm">
                      {payment.student.firstName.charAt(0)}{payment.student.lastName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">
                        {payment.student.firstName} {payment.student.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{payment.student.class?.name || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 text-sm">ZMW {Number(payment.amount).toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-medium">
              <tr>
                <th className="px-6 py-3">Student</th>
                <th className="px-6 py-3">Class</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Method</th>
                <th className="px-6 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats?.recentPayments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No recent payments</td>
                </tr>
              ) : (
                stats?.recentPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {payment.student.firstName} {payment.student.lastName}
                    </td>
                    <td className="px-6 py-4">{payment.student.class?.name || 'N/A'}</td>
                    <td className="px-6 py-4 font-medium">ZMW {Number(payment.amount).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`status-badge ${
                        payment.method === 'CASH' ? 'bg-green-100 text-green-800' : 
                        payment.method === 'MOBILE_MONEY' ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {payment.method.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
