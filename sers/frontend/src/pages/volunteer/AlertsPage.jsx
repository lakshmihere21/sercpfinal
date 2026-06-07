import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { alertAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import toast from 'react-hot-toast';

const TYPE_ICONS = { medical:'🏥', accident:'🚗', fire:'🔥', crime:'🚔', women_safety:'👩', natural_disaster:'🌪️', other:'⚠️' };
const SEV_COLORS = { CRITICAL:'bg-red-100 text-red-700', HIGH:'bg-orange-100 text-orange-700', MEDIUM:'bg-yellow-100 text-yellow-700', LOW:'bg-green-100 text-green-700' };
const STATUS_COLORS = { ACTIVE:'bg-red-100 text-red-700', RESPONDER_ASSIGNED:'bg-blue-100 text-blue-700', IN_PROGRESS:'bg-orange-100 text-orange-700', ARRIVED:'bg-purple-100 text-purple-700', RESOLVED:'bg-green-100 text-green-700' };

export default function VolunteerAlertsPage() {
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('ACTIVE');

  useEffect(() => {
    if (!navigator.geolocation) { setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await alertAPI.getNearby({ lat: pos.coords.latitude, lng: pos.coords.longitude, radius: 15 });
        setAlerts(res.data.data || []);
      } catch { toast.error('Failed to load alerts'); }
      finally { setLoading(false); }
    }, () => setLoading(false));
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.on('NEW_EMERGENCY_ALERT', ({ alert }) => setAlerts(prev => [alert, ...prev]));
    socket.on('ALERT_STATUS_UPDATED', ({ alertId, status }) => {
      setAlerts(prev => prev.map(a => a._id === alertId ? { ...a, status } : a));
    });
    return () => { socket.off('NEW_EMERGENCY_ALERT'); socket.off('ALERT_STATUS_UPDATED'); };
  }, []);

  const filtered = filter === 'ALL' ? alerts : alerts.filter(a => a.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-slate-900">Nearby Emergencies</h1>
        <p className="text-slate-500 text-sm">{alerts.length} within 15km</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[['ACTIVE','🔴 Active'],['ALL','📋 All'],['RESOLVED','✅ Resolved']].map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
              filter === f ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-semibold text-slate-800">No emergencies found</p>
          <p className="text-slate-500 text-sm mt-1">Stay ready — you will be notified instantly when someone needs help</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(alert => (
            <motion.div key={alert._id} layout
              className="card hover:shadow-md transition-all border-l-4 border-green-500">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                  {TYPE_ICONS[alert.type] || '⚠️'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-slate-800 text-sm capitalize">{alert.type?.replace('_',' ')}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEV_COLORS[alert.severity]}`}>{alert.severity}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[alert.status] || 'bg-slate-100 text-slate-500'}`}>
                      {alert.status?.replace('_',' ')}
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs">{alert.address}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{alert.citizenName} · {new Date(alert.createdAt).toLocaleString()}</p>
                  {alert.customMessage && (
                    <p className="text-slate-600 text-xs mt-1 italic">"{alert.customMessage}"</p>
                  )}
                </div>
                <Link to={`/volunteer/alerts/${alert._id}`}
                  className="bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors flex-shrink-0 text-center">
                  Help →
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
