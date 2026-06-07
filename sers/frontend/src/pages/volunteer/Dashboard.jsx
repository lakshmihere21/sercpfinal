import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { alertAPI } from '../../services/api';
import { getSocket, emitLocationUpdate, emitResponderStatus } from '../../services/socket';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const TYPE_ICONS = {
  medical: '🏥', accident: '🚗', fire: '🔥', crime: '🚔',
  women_safety: '👩', natural_disaster: '🌪️', other: '⚠️',
};
const SEV_COLORS = {
  CRITICAL: 'bg-red-100 text-red-700 border-red-200',
  HIGH:     'bg-orange-100 text-orange-700 border-orange-200',
  MEDIUM:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  LOW:      'bg-green-100 text-green-700 border-green-200',
};

export default function VolunteerDashboard() {
  const { user } = useAuth();
  const [nearbyAlerts, setNearbyAlerts] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [status, setStatus]             = useState('available');
  const [location, setLocation]         = useState(null);
  const [gpsStatus, setGpsStatus]       = useState('getting');
  const [newCount, setNewCount]         = useState(0);
  const [totalAssisted, setTotalAssisted] = useState(0);

  // Get GPS and fetch nearby alerts
  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus('error'); setLoading(false); return; }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ latitude, longitude });
        setGpsStatus('active');
        try {
          const res = await alertAPI.getNearby({ lat: latitude, lng: longitude, radius: 10 });
          setNearbyAlerts(res.data.data || []);
        } catch {}
        setLoading(false);

        // Start broadcasting position
        const watch = navigator.geolocation.watchPosition(
          (p) => emitLocationUpdate({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
          null,
          { enableHighAccuracy: true, maximumAge: 5000 }
        );
        return () => navigator.geolocation.clearWatch(watch);
      },
      () => { setGpsStatus('denied'); setLoading(false); }
    );
  }, []);

  // Socket — receive new SOS
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handleNew = ({ alert }) => {
      setNearbyAlerts(prev => [alert, ...prev]);
      setNewCount(c => c + 1);
      toast.custom(() => (
        <div className="bg-green-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3">
          <span className="text-xl">🚨</span>
          <div>
            <p className="font-semibold text-sm">New Emergency Nearby!</p>
            <p className="text-xs opacity-90">{alert.type?.replace('_', ' ')} — can you help?</p>
          </div>
        </div>
      ));
    };
    socket.on('NEW_EMERGENCY_ALERT', handleNew);
    socket.on('SOS_RECEIVED', ({ alert }) => handleNew({ alert }));
    return () => { socket.off('NEW_EMERGENCY_ALERT', handleNew); socket.off('SOS_RECEIVED'); };
  }, []);

  const updateStatus = (s) => {
    setStatus(s);
    emitResponderStatus(s);
    toast.success(`Status set to ${s}`);
  };

  const activeAlerts  = nearbyAlerts.filter(a => a.status === 'ACTIVE');
  const criticalCount = activeAlerts.filter(a => a.severity === 'CRITICAL').length;

  return (
    <div className="space-y-5">

      {/* Welcome banner */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-green-600 to-green-700 rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold mb-1">Hello, {user?.name?.split(' ')[0]}! 🤝</h1>
            <p className="text-green-100 text-sm">Volunteer Dashboard — thank you for helping your community</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`w-2 h-2 rounded-full ${gpsStatus === 'active' ? 'bg-white animate-pulse' : 'bg-green-300'}`} />
              <span className="text-xs text-green-100">
                {gpsStatus === 'active' ? 'GPS active — broadcasting location' : gpsStatus === 'getting' ? 'Getting location...' : 'Location unavailable'}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-green-100 text-xs font-medium">Your Status</p>
            <div className="flex gap-1.5">
              {[['available', '🟢'], ['busy', '🟡'], ['offline', '⚫']].map(([s, icon]) => (
                <button key={s} onClick={() => updateStatus(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-all ${
                    status === s ? 'bg-white text-green-700' : 'bg-green-500/50 text-white hover:bg-green-500'
                  }`}>
                  {icon} {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-4 flex-wrap">
          {[
            ['🚨', activeAlerts.length, 'Active Nearby'],
            ['🔴', criticalCount,       'Critical'],
            ['✅', totalAssisted,       'Total Assisted'],
            ['📍', '10km',             'Your Radius'],
          ].map(([icon, val, label]) => (
            <div key={label} className="bg-white/15 rounded-xl px-3 py-2 text-center min-w-16">
              <p className="text-lg">{icon}</p>
              <p className="text-base font-bold">{val}</p>
              <p className="text-green-100 text-xs">{label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Status denied warning */}
      {gpsStatus === 'denied' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold text-yellow-800 text-sm">Location access denied</p>
            <p className="text-yellow-700 text-xs mt-1">Allow location in browser settings so nearby citizens can find you.</p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="font-semibold text-slate-800 text-base mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Link to="/volunteer/map"
            className="card hover:shadow-md transition-all text-center group cursor-pointer">
            <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">🗺️</div>
            <p className="font-medium text-slate-800 text-sm">Live Map</p>
            <p className="text-slate-500 text-xs mt-0.5">See all nearby SOS</p>
          </Link>
          <Link to="/volunteer/alerts"
            className="card hover:shadow-md transition-all text-center group cursor-pointer">
            <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">🚨</div>
            <p className="font-medium text-slate-800 text-sm">Active Alerts</p>
            <p className="text-slate-500 text-xs mt-0.5">{activeAlerts.length} nearby</p>
          </Link>
          <Link to="/volunteer/profile"
            className="card hover:shadow-md transition-all text-center group cursor-pointer">
            <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">👤</div>
            <p className="font-medium text-slate-800 text-sm">My Profile</p>
            <p className="text-slate-500 text-xs mt-0.5">Skills &amp; info</p>
          </Link>
        </div>
      </div>

      {/* Nearby alerts list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800 text-base">Nearby Emergencies</h2>
          {newCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
              {newCount} new
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin w-7 h-7 border-4 border-green-600 border-t-transparent rounded-full" />
          </div>
        ) : activeAlerts.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-4xl mb-3">✅</p>
            <p className="font-semibold text-slate-800">No active emergencies nearby</p>
            <p className="text-slate-500 text-sm mt-1">Stay ready — you will be notified instantly</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAlerts.map(alert => (
              <motion.div key={alert._id} layout
                className="card hover:shadow-md transition-all border-l-4 border-green-500">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                    {TYPE_ICONS[alert.type] || '⚠️'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-slate-800 text-sm capitalize">
                        {alert.type?.replace('_', ' ')}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${SEV_COLORS[alert.severity]}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <p className="text-slate-500 text-xs truncate">{alert.address}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{alert.citizenName}</p>
                    {alert.customMessage && (
                      <p className="text-slate-600 text-xs mt-1 italic">"{alert.customMessage}"</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Link to={`/volunteer/alerts/${alert._id}`}
                      className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors text-center">
                      Help →
                    </Link>
                    <p className="text-xs text-slate-400 text-center">
                      {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Volunteer tips */}
      <div className="card bg-green-50 border-green-100">
        <h3 className="font-semibold text-green-800 text-sm mb-2">💡 Volunteer Tips</h3>
        <div className="space-y-1.5 text-xs text-green-700">
          <p>• Keep your status <b>Available</b> so you appear to nearby responders</p>
          <p>• Always call <b>112</b> first — you assist, professionals lead</p>
          <p>• Share your live location with the citizen by joining their alert room</p>
          <p>• Do not put yourself in danger — help only within your skill level</p>
        </div>
      </div>

    </div>
  );
}
