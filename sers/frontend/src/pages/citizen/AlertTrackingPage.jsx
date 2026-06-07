import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { alertAPI, chatAPI } from '../../services/api';
import { getSocket, joinAlertRoom, leaveAlertRoom, emitLocationUpdate, emitSendMessage, emitTyping } from '../../services/socket';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

// ── Pulsing red dot — YOUR live location
const myLocationIcon = L.divIcon({
  html: `
    <div style="position:relative;width:24px;height:24px">
      <div style="position:absolute;inset:0;border-radius:50%;background:#dc2626;opacity:0.3;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div>
      <div style="position:absolute;inset:5px;border-radius:50%;background:#dc2626;border:2.5px solid white;box-shadow:0 0 8px rgba(220,38,38,0.6)"></div>
    </div>
    <style>@keyframes ping{0%{transform:scale(1);opacity:0.3}70%{transform:scale(2.4);opacity:0}100%{transform:scale(2.4);opacity:0}}</style>
  `,
  className: 'bg-transparent border-none',
  iconAnchor: [12, 12],
});

// ── Blue ambulance — responder live location
const responderIcon = L.divIcon({
  html: `<div style="background:#2563eb;border:3px solid white;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 2px 10px rgba(37,99,235,0.5)">🚑</div>`,
  className: 'bg-transparent border-none',
  iconAnchor: [19, 19],
});

// ── SOS origin marker
const createIcon = (emoji, size = 30) => L.divIcon({
  html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.35))">${emoji}</div>`,
  className: 'bg-transparent border-none',
  iconAnchor: [size / 2, size],
});

// ── Auto-pan map to follow your location
function LiveFollow({ position, follow }) {
  const map = useMap();
  useEffect(() => {
    if (position && follow) {
      map.setView([position.lat, position.lng], map.getZoom(), { animate: true, duration: 1 });
    }
  }, [position, follow]);
  return null;
}

// ── GPS accuracy circle drawn as Leaflet layer
function AccuracyCircle({ position, accuracy }) {
  const map = useMap();
  const ref = useRef(null);
  useEffect(() => {
    if (!position || !accuracy) return;
    if (ref.current) map.removeLayer(ref.current);
    ref.current = L.circle([position.lat, position.lng], {
      radius: accuracy,
      color: '#dc2626', fillColor: '#dc2626',
      fillOpacity: 0.07, weight: 1, dashArray: '4',
    }).addTo(map);
    return () => { if (ref.current) map.removeLayer(ref.current); };
  }, [position, accuracy]);
  return null;
}

const STATUS_STEPS = ['ACTIVE', 'RESPONDER_ASSIGNED', 'IN_PROGRESS', 'ARRIVED', 'RESOLVED'];

export default function AlertTrackingPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [alert, setAlert]                   = useState(null);
  const [messages, setMessages]             = useState([]);
  const [newMsg, setNewMsg]                 = useState('');
  const [loading, setLoading]               = useState(true);
  const [tab, setTab]                       = useState('map');
  const [isTyping, setIsTyping]             = useState(false);

  // Live location
  const [myLocation, setMyLocation]         = useState(null);
  const [responderLocation, setResponderLocation] = useState(null);
  const [locationHistory, setLocationHistory] = useState([]);
  const [gpsStatus, setGpsStatus]           = useState('getting');
  const [accuracy, setAccuracy]             = useState(null);
  const [speed, setSpeed]                   = useState(null);
  const [followMe, setFollowMe]             = useState(true);

  const chatEndRef = useRef(null);
  const watchRef   = useRef(null);

  // ── Load alert + chat ──────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [alertRes, chatRes] = await Promise.all([
          alertAPI.getOne(id),
          chatAPI.getMessages(id),
        ]);
        setAlert(alertRes.data.data);
        setMessages(chatRes.data.data || []);
      } catch { toast.error('Failed to load alert'); }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  // ── GPS live tracking ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      return;
    }

    setGpsStatus('getting');

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy: acc, speed: spd } = pos.coords;
        const newPos = { lat: latitude, lng: longitude };
        setMyLocation(newPos);
        setAccuracy(Math.round(acc));
        setSpeed(spd ? Math.round(spd * 3.6) : null);
        setGpsStatus('active');

        // Build trail — last 50 points
        setLocationHistory(prev => [...prev, [latitude, longitude]].slice(-50));

        // Broadcast to socket so responder + admin see your position
        emitLocationUpdate({ latitude, longitude, alertId: id, accuracy: acc });
      },
      (err) => {
        setGpsStatus(err.code === 1 ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );

    return () => {
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [id]);

  // ── Socket events ──────────────────────────────────────────────────────────
  useEffect(() => {
    joinAlertRoom(id);
    const socket = getSocket();
    if (!socket) return;

    socket.on('LOCATION_UPDATE', (data) => {
      if (data.role === 'responder') {
        setResponderLocation({ lat: data.latitude, lng: data.longitude });
      }
    });
    socket.on('STATUS_UPDATE', ({ status }) => {
      setAlert(prev => prev ? { ...prev, status } : prev);
      toast.success(`Status: ${status.replace(/_/g, ' ')}`);
    });
    socket.on('NEW_MESSAGE', (msg) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    });
    socket.on('USER_TYPING', ({ name, isTyping: t }) => {
      setIsTyping(t ? `${name} is typing...` : false);
    });

    return () => {
      leaveAlertRoom(id);
      socket.off('LOCATION_UPDATE');
      socket.off('STATUS_UPDATE');
      socket.off('NEW_MESSAGE');
      socket.off('USER_TYPING');
    };
  }, [id]);

  // ── Chat ───────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    if (!newMsg.trim()) return;
    emitSendMessage({ alertId: id, message: newMsg.trim(), type: 'text' });
    setNewMsg('');
    emitTyping(id, false);
  }, [newMsg, id]);

  const handleTyping = (val) => {
    setNewMsg(val);
    emitTyping(id, val.length > 0);
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const statusIndex = STATUS_STEPS.indexOf(alert?.status);
  const alertCoords = alert?.location?.coordinates
    ? [alert.location.coordinates[1], alert.location.coordinates[0]]
    : null;
  const mapCenter = myLocation
    ? [myLocation.lat, myLocation.lng]
    : alertCoords || [20.5937, 78.9629];

  const distanceKm = myLocation && responderLocation ? (() => {
    const R = 6371;
    const dLat = ((responderLocation.lat - myLocation.lat) * Math.PI) / 180;
    const dLon = ((responderLocation.lng - myLocation.lng) * Math.PI) / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos((myLocation.lat*Math.PI)/180) * Math.cos((responderLocation.lat*Math.PI)/180) * Math.sin(dLon/2)**2;
    return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
  })() : null;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full" />
    </div>
  );
  if (!alert) return <div className="text-center py-16 text-slate-500">Alert not found</div>;

  return (
    <div className="space-y-4">

      {/* Alert Header */}
      <div className="card bg-gradient-to-r from-red-600 to-red-700 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl animate-pulse">🚨</span>
              <h1 className="font-semibold text-base">{alert.type?.replace(/_/g,' ').toUpperCase()}</h1>
            </div>
            <p className="text-red-200 text-xs">{alert.alertId}</p>
          </div>
          <div className="text-right">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              alert.status === 'RESOLVED' ? 'bg-green-500' :
              alert.status === 'CANCELLED' ? 'bg-slate-500' : 'bg-white/20'
            }`}>{alert.status?.replace(/_/g,' ')}</span>
            <p className="text-red-200 text-xs mt-1">{alert.severity}</p>
          </div>
        </div>
      </div>

      {/* GPS Status Bar */}
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
        gpsStatus === 'active'  ? 'bg-green-50 border border-green-200 text-green-800' :
        gpsStatus === 'getting' ? 'bg-blue-50 border border-blue-200 text-blue-800' :
        'bg-red-50 border border-red-200 text-red-800'
      }`}>
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          gpsStatus === 'active'  ? 'bg-green-500 animate-pulse' :
          gpsStatus === 'getting' ? 'bg-blue-400 animate-pulse' : 'bg-red-500'
        }`} />
        <span className="flex-1 text-xs">
          {gpsStatus === 'active'  && `📍 Live GPS active${accuracy ? ` · ±${accuracy}m` : ''}${speed ? ` · ${speed} km/h` : ''}`}
          {gpsStatus === 'getting' && '📡 Getting your GPS location...'}
          {gpsStatus === 'denied'  && '🚫 Location access denied — allow in browser settings'}
          {gpsStatus === 'error'   && '⚠️ GPS error — move to open area and reload'}
        </span>
        {(gpsStatus === 'denied' || gpsStatus === 'error') && (
          <button onClick={() => window.location.reload()}
            className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg flex-shrink-0">
            Retry
          </button>
        )}
      </div>

      {/* Status Progress */}
      <div className="card">
        <p className="font-medium text-slate-700 text-sm mb-3">Response Progress</p>
        <div className="flex items-center gap-1">
          {STATUS_STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                i < statusIndex  ? 'bg-green-500 text-white' :
                i === statusIndex ? 'bg-red-600 text-white animate-pulse' :
                'bg-slate-100 text-slate-400'
              }`}>{i < statusIndex ? '✓' : i + 1}</div>
              {i < STATUS_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 rounded ${i < statusIndex ? 'bg-green-400' : 'bg-slate-100'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1.5">
          {STATUS_STEPS.map(s => (
            <span key={s} className="text-xs text-slate-400 text-center" style={{flex:1}}>{s.split('_')[0]}</span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {[['map','🗺️ Live Map'],['chat','💬 Chat'],['timeline','📋 Timeline']].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab===t ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── MAP TAB ── */}
      {tab === 'map' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

          {/* Map toolbar */}
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {distanceKm && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">
                  🚑 Responder {distanceKm} km away
                </span>
              )}
              {locationHistory.length > 1 && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                  {locationHistory.length} GPS points tracked
                </span>
              )}
            </div>
            <button
              onClick={() => setFollowMe(f => !f)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                followMe ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {followMe ? '🔒 Following You' : '📍 Follow Me'}
            </button>
          </div>

          {/* Map */}
          <div className="h-96 rounded-2xl overflow-hidden shadow-sm border border-slate-100">
            <MapContainer center={mapCenter} zoom={15} className="h-full w-full" zoomControl={true}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />

              {myLocation && <LiveFollow position={myLocation} follow={followMe} />}
              {myLocation && accuracy && <AccuracyCircle position={myLocation} accuracy={accuracy} />}

              {/* Your live location — pulsing red dot */}
              {myLocation && (
                <Marker position={[myLocation.lat, myLocation.lng]} icon={myLocationIcon} zIndexOffset={1000}>
                  <Popup>
                    <div style={{minWidth:'160px'}}>
                      <p style={{fontWeight:600,fontSize:'13px',marginBottom:'4px'}}>📍 Your Live Location</p>
                      <p style={{fontSize:'12px',color:'#64748b'}}>Lat: {myLocation.lat.toFixed(5)}</p>
                      <p style={{fontSize:'12px',color:'#64748b'}}>Lng: {myLocation.lng.toFixed(5)}</p>
                      {accuracy && <p style={{fontSize:'12px',color:'#64748b'}}>Accuracy: ±{accuracy}m</p>}
                      {speed !== null && <p style={{fontSize:'12px',color:'#64748b'}}>Speed: {speed} km/h</p>}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Location trail — path you have traveled */}
              {locationHistory.length > 1 && (
                <Polyline positions={locationHistory} color="#dc2626" weight={3} opacity={0.4} dashArray="6 4" />
              )}

              {/* SOS origin — where alert was triggered */}
              {alertCoords && (
                <Marker position={alertCoords} icon={createIcon('🆘', 28)}>
                  <Popup>
                    <p style={{fontWeight:600,fontSize:'13px'}}>🆘 SOS Triggered Here</p>
                    <p style={{fontSize:'12px',color:'#64748b'}}>{alert.address}</p>
                  </Popup>
                </Marker>
              )}

              {/* Responder live location */}
              {responderLocation && (
                <Marker position={[responderLocation.lat, responderLocation.lng]} icon={responderIcon} zIndexOffset={900}>
                  <Popup>
                    <p style={{fontWeight:600,fontSize:'13px'}}>🚑 Responder Live Location</p>
                    {distanceKm && <p style={{fontSize:'12px',color:'#64748b'}}>{distanceKm} km from you</p>}
                    {alert.assignedResponder?.name && (
                      <p style={{fontSize:'12px',color:'#64748b'}}>{alert.assignedResponder.name}</p>
                    )}
                  </Popup>
                </Marker>
              )}

              {/* Route line between you and responder */}
              {myLocation && responderLocation && (
                <Polyline
                  positions={[[myLocation.lat, myLocation.lng],[responderLocation.lat, responderLocation.lng]]}
                  color="#2563eb" weight={2} opacity={0.6} dashArray="8 5"
                />
              )}
            </MapContainer>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />Your live location
            </div>
            <div className="flex items-center gap-1.5">
              <span>🆘</span> SOS origin
            </div>
            {responderLocation && <div className="flex items-center gap-1.5"><span>🚑</span> Responder</div>}
            {locationHistory.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span style={{width:'18px',height:'3px',background:'#dc262660',display:'inline-block',borderRadius:'2px'}} />
                Your path
              </div>
            )}
          </div>

          {/* GPS denied help */}
          {gpsStatus === 'denied' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-3">
              <p className="text-red-800 font-medium text-sm mb-2">📵 Location Access Denied</p>
              <div className="space-y-1 text-xs text-red-700">
                <p><b>Chrome:</b> Click 🔒 in address bar → Location → Allow</p>
                <p><b>Firefox:</b> Click shield icon → Permissions → Allow Location</p>
                <p><b>Safari:</b> Settings → Safari → Location → Allow</p>
              </div>
              <button onClick={() => window.location.reload()}
                className="mt-3 bg-red-600 text-white text-xs px-4 py-1.5 rounded-lg font-medium hover:bg-red-700">
                Reload &amp; Try Again
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* ── CHAT TAB ── */}
      {tab === 'chat' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card">
          <div className="h-72 overflow-y-auto mb-3 space-y-3 pr-1">
            {messages.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                <p className="text-3xl mb-2">💬</p>
                <p className="text-sm">No messages yet. Start the conversation.</p>
              </div>
            )}
            {messages.map((msg, i) => {
              const isOwn = msg.sender?._id === user?._id || msg.sender === user?._id;
              return (
                <div key={i} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs px-4 py-2.5 rounded-2xl text-sm ${
                    isOwn ? 'bg-blue-600 text-white rounded-br-sm' :
                    msg.senderRole === 'admin'     ? 'bg-purple-100 text-purple-800 rounded-bl-sm' :
                    msg.senderRole === 'responder' ? 'bg-blue-100 text-blue-800 rounded-bl-sm' :
                    'bg-slate-100 text-slate-800 rounded-bl-sm'
                  }`}>
                    {!isOwn && msg.senderName && (
                      <p className="text-xs font-semibold opacity-70 mb-1">{msg.senderName}</p>
                    )}
                    <p>{msg.message}</p>
                    <p className={`text-xs mt-1 text-right ${isOwn ? 'text-blue-200' : 'opacity-50'}`}>
                      {new Date(msg.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                    </p>
                  </div>
                </div>
              );
            })}
            {isTyping && <p className="text-xs text-slate-400 italic px-2">{isTyping}</p>}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2">
            <input value={newMsg} onChange={e => handleTyping(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              className="input-field text-sm" placeholder="Type a message..." maxLength={500} />
            <button onClick={sendMessage} className="btn-primary px-4 py-2 text-sm">→</button>
          </div>
        </motion.div>
      )}

      {/* ── TIMELINE TAB ── */}
      {tab === 'timeline' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card">
          <h3 className="font-semibold text-slate-800 text-sm mb-4">Incident Timeline</h3>
          {!alert.timeline?.length ? (
            <p className="text-slate-400 text-sm">No events yet</p>
          ) : (
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-100" />
              <div className="space-y-4">
                {alert.timeline.map((event, i) => (
                  <div key={i} className="flex gap-4 items-start pl-9 relative">
                    <div className="absolute left-1.5 w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow-sm" />
                    <div className="flex-1">
                      <p className="font-medium text-slate-800 text-sm">{event.event?.replace(/_/g,' ')}</p>
                      {event.description && <p className="text-slate-500 text-xs mt-0.5">{event.description}</p>}
                      <p className="text-slate-400 text-xs mt-1">{new Date(event.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Responder Card */}
      {alert.assignedResponder && (
        <div className="card bg-blue-50 border-blue-100">
          <p className="font-medium text-blue-800 text-sm mb-3">🚑 Assigned Responder</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
              {alert.assignedResponder.name?.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">{alert.assignedResponder.name}</p>
              <a href={`tel:${alert.assignedResponder.phone}`} className="text-blue-600 text-xs font-medium">
                📞 {alert.assignedResponder.phone}
              </a>
              {distanceKm && <p className="text-slate-500 text-xs mt-0.5">📍 {distanceKm} km away</p>}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
