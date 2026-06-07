import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { alertAPI } from '../../services/api';
import { getSocket, emitLocationUpdate, emitResponderStatus } from '../../services/socket';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

// ── Icons ──────────────────────────────────────────────────────────────────────
const myIcon = L.divIcon({
  html: `
    <div style="position:relative;width:28px;height:28px">
      <div style="position:absolute;inset:0;border-radius:50%;background:#2563eb;opacity:0.25;animation:pingb 1.5s infinite"></div>
      <div style="position:absolute;inset:5px;border-radius:50%;background:#2563eb;border:2.5px solid white;box-shadow:0 0 8px rgba(37,99,235,0.5)"></div>
    </div>
    <style>@keyframes pingb{0%{transform:scale(1);opacity:0.25}70%{transform:scale(2.5);opacity:0}100%{transform:scale(2.5);opacity:0}}</style>
  `,
  className: 'bg-transparent border-none',
  iconAnchor: [14, 14],
});

const createIcon = (emoji, size = 30) => L.divIcon({
  html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.3))">${emoji}</div>`,
  className: 'bg-transparent border-none',
  iconAnchor: [size / 2, size],
});

const TYPE_ICONS  = { medical:'🏥', accident:'🚗', fire:'🔥', crime:'🚔', women_safety:'👩', natural_disaster:'🌪️', other:'⚠️' };
const SEV_COLORS  = { CRITICAL:'#dc2626', HIGH:'#ea580c', MEDIUM:'#d97706', LOW:'#16a34a' };

function RecenterOnMe({ lat, lng, follow }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng && follow) map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, follow]);
  return null;
}

export default function ResponderMapPage() {
  const { user } = useAuth();
  const [alerts, setAlerts]         = useState([]);
  const [myLocation, setMyLocation] = useState(null);
  const [liveUsers, setLiveUsers]   = useState({});
  const [filter, setFilter]         = useState('ALL');
  const [loading, setLoading]       = useState(true);
  const [gpsStatus, setGpsStatus]   = useState('getting');
  const [accuracy, setAccuracy]     = useState(null);
  const [followMe, setFollowMe]     = useState(true);
  const [responderStatus, setResponderStatus] = useState('available');
  const watchRef = useRef(null);

  // ── GPS continuous watch ──────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus('error'); setLoading(false); return; }

    // Get first position to load nearby alerts
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setMyLocation({ lat: latitude, lng: longitude });
        setGpsStatus('active');
        setLoading(false);
        try {
          const res = await alertAPI.getNearby({ lat: latitude, lng: longitude, radius: 30 });
          setAlerts(res.data.data || []);
        } catch {}
      },
      () => { setGpsStatus('error'); setLoading(false); }
    );

    // Continuous watch — broadcasts every position update
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy: acc } = pos.coords;
        setMyLocation({ lat: latitude, lng: longitude });
        setAccuracy(Math.round(acc));
        setGpsStatus('active');
        emitLocationUpdate({ latitude, longitude });
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );

    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current); };
  }, []);

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('NEW_EMERGENCY_ALERT', ({ alert }) => {
      setAlerts(prev => [alert, ...prev]);
      toast.custom(() => (
        <div className="bg-orange-500 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3">
          <span className="text-xl">🚨</span>
          <div>
            <p className="font-semibold text-sm">New SOS nearby!</p>
            <p className="text-xs opacity-90">{alert.type?.replace('_',' ')}</p>
          </div>
        </div>
      ));
    });

    socket.on('TRACK_USER', (data) => {
      if (data.userId !== user?._id) {
        setLiveUsers(prev => ({ ...prev, [data.userId]: data }));
      }
    });

    socket.on('ALERT_STATUS_UPDATED', ({ alertId, status }) => {
      setAlerts(prev => prev.map(a => a._id === alertId ? { ...a, status } : a));
    });

    return () => {
      socket.off('NEW_EMERGENCY_ALERT');
      socket.off('TRACK_USER');
      socket.off('ALERT_STATUS_UPDATED');
    };
  }, [user?._id]);

  const updateStatus = (newStatus) => {
    setResponderStatus(newStatus);
    emitResponderStatus(newStatus);
    toast.success(`Status: ${newStatus}`);
  };

  const filtered = filter === 'ALL'
    ? alerts
    : alerts.filter(a => a.status === filter || a.severity === filter || a.type === filter.toLowerCase());

  const activeCount = alerts.filter(a => a.status === 'ACTIVE').length;

  return (
    <div className="h-full flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Live Map</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`w-2 h-2 rounded-full ${gpsStatus === 'active' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
            <span className="text-xs text-slate-500">
              {gpsStatus === 'active' ? `GPS active${accuracy ? ` · ±${accuracy}m` : ''}` : 'Getting location...'}
            </span>
            {activeCount > 0 && (
              <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {activeCount} active SOS
              </span>
            )}
          </div>
        </div>

        {/* Responder status */}
        <div className="flex gap-1.5">
          {[['available','🟢'],['busy','🟡'],['offline','⚫']].map(([s, icon]) => (
            <button key={s} onClick={() => updateStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors capitalize ${
                responderStatus === s
                  ? s === 'available' ? 'bg-green-600 text-white'
                  : s === 'busy' ? 'bg-orange-500 text-white'
                  : 'bg-slate-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>{icon} {s}</button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['ALL','ACTIVE','CRITICAL','HIGH','medical','fire','accident'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all capitalize ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>{f}</button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 flex-1">

        {/* MAP */}
        <div className="lg:col-span-2 rounded-2xl overflow-hidden shadow-sm border border-slate-100" style={{minHeight:'420px'}}>
          {loading ? (
            <div className="h-full flex items-center justify-center bg-slate-50" style={{minHeight:'420px'}}>
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Getting your GPS location...</p>
              </div>
            </div>
          ) : (
            <MapContainer
              center={myLocation ? [myLocation.lat, myLocation.lng] : [20.5937, 78.9629]}
              zoom={13}
              style={{height:'100%',minHeight:'420px',width:'100%'}}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />

              {myLocation && <RecenterOnMe lat={myLocation.lat} lng={myLocation.lng} follow={followMe} />}

              {/* My location — blue pulsing dot */}
              {myLocation && (
                <>
                  <Marker position={[myLocation.lat, myLocation.lng]} icon={myIcon} zIndexOffset={1000}>
                    <Popup>
                      <p style={{fontWeight:600,fontSize:'13px'}}>🛡️ Your Location</p>
                      <p style={{fontSize:'12px',color:'#64748b'}}>{user?.name}</p>
                      {accuracy && <p style={{fontSize:'12px',color:'#64748b'}}>Accuracy: ±{accuracy}m</p>}
                    </Popup>
                  </Marker>
                  {accuracy && (
                    <Circle center={[myLocation.lat, myLocation.lng]} radius={accuracy}
                      color="#2563eb" fillColor="#2563eb" fillOpacity={0.08} weight={1} />
                  )}
                  <Circle center={[myLocation.lat, myLocation.lng]} radius={30000}
                    color="#2563eb" fillColor="#2563eb" fillOpacity={0.03} weight={1} dashArray="6" />
                </>
              )}

              {/* Alert markers */}
              {filtered.map(alert => {
                const lat = alert.location?.coordinates?.[1];
                const lng = alert.location?.coordinates?.[0];
                if (!lat || !lng) return null;
                return (
                  <Marker key={alert._id} position={[lat, lng]} icon={createIcon(TYPE_ICONS[alert.type] || '⚠️', 28)}>
                    <Popup>
                      <div style={{minWidth:'160px'}}>
                        <p style={{fontWeight:600,fontSize:'13px',marginBottom:'4px'}}>
                          {TYPE_ICONS[alert.type]} {alert.type?.replace('_',' ').toUpperCase()}
                        </p>
                        <p style={{fontSize:'11px',fontWeight:500,color:SEV_COLORS[alert.severity],marginBottom:'4px'}}>{alert.severity}</p>
                        <p style={{fontSize:'12px',color:'#64748b',marginBottom:'2px'}}>{alert.citizenName}</p>
                        <p style={{fontSize:'11px',color:'#94a3b8',marginBottom:'8px'}}>{alert.address}</p>
                        <Link to={`/citizen/alerts/${alert._id}`}
                          style={{display:'block',background:'#ea580c',color:'#fff',textAlign:'center',padding:'5px 10px',borderRadius:'7px',fontSize:'12px',fontWeight:500,textDecoration:'none'}}>
                          Respond →
                        </Link>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Live tracked citizens */}
              {Object.values(liveUsers).map(u => (
                u.latitude && u.longitude ? (
                  <Marker key={u.userId} position={[u.latitude, u.longitude]} icon={createIcon('📍', 22)}>
                    <Popup>
                      <p style={{fontSize:'12px',fontWeight:500}}>{u.name}</p>
                      <p style={{fontSize:'11px',color:'#64748b'}}>{u.role}</p>
                    </Popup>
                  </Marker>
                ) : null
              ))}
            </MapContainer>
          )}
        </div>

        {/* Alert sidebar */}
        <div className="flex flex-col gap-2 overflow-y-auto" style={{maxHeight:'520px'}}>
          <div className="flex items-center justify-between sticky top-0 bg-slate-50 py-1 z-10">
            <p className="text-sm font-medium text-slate-700">{filtered.length} alerts</p>
            <button onClick={() => setFollowMe(f => !f)}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium ${followMe ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {followMe ? '🔒 Following' : '📍 Follow Me'}
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-8 text-slate-400 bg-white rounded-xl border border-slate-100">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm">No alerts for this filter</p>
            </div>
          ) : filtered.map(alert => (
            <div key={alert._id} className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start gap-2">
                <span className="text-xl flex-shrink-0">{TYPE_ICONS[alert.type] || '⚠️'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-medium text-slate-800 text-xs capitalize">{alert.type?.replace('_',' ')}</p>
                    <span className="text-xs font-semibold flex-shrink-0" style={{color:SEV_COLORS[alert.severity]}}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{alert.address}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(alert.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                  </p>
                  <Link to={`/citizen/alerts/${alert._id}`}
                    className="inline-block mt-2 bg-orange-500 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors">
                    Respond →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
