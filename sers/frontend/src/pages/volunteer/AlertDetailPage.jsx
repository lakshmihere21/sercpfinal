import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { alertAPI, chatAPI } from '../../services/api';
import { getSocket, joinAlertRoom, leaveAlertRoom, emitLocationUpdate, emitSendMessage, emitTyping } from '../../services/socket';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const myIcon = L.divIcon({
  html: `<div style="position:relative;width:24px;height:24px"><div style="position:absolute;inset:0;border-radius:50%;background:#16a34a;opacity:0.3;animation:ping 1.5s infinite"></div><div style="position:absolute;inset:5px;border-radius:50%;background:#16a34a;border:2px solid white;box-shadow:0 0 6px rgba(22,163,74,0.6)"></div></div><style>@keyframes ping{0%{transform:scale(1);opacity:0.3}70%{transform:scale(2.3);opacity:0}100%{transform:scale(2.3);opacity:0}}</style>`,
  className: 'bg-transparent border-none', iconAnchor: [12, 12],
});
const sosIcon = L.divIcon({
  html: `<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.3))">🆘</div>`,
  className: 'bg-transparent border-none', iconAnchor: [14, 28],
});

function AutoCenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => { if (lat && lng) map.setView([lat, lng], map.getZoom(), { animate: true }); }, [lat, lng]);
  return null;
}

export default function VolunteerAlertDetailPage() {
  const { id }       = useParams();
  const { user }     = useAuth();
  const [alert, setAlert]         = useState(null);
  const [messages, setMessages]   = useState([]);
  const [newMsg, setNewMsg]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState('map');
  const [isTyping, setIsTyping]   = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [gpsStatus, setGpsStatus]   = useState('getting');
  const [citizenLocation, setCitizenLocation] = useState(null);
  const chatEndRef = useRef(null);
  const watchRef   = useRef(null);

  useEffect(() => {
    Promise.all([alertAPI.getOne(id), chatAPI.getMessages(id)]).then(([a, c]) => {
      setAlert(a.data.data);
      setMessages(c.data.data || []);
      // Set initial citizen location from alert
      if (a.data.data?.location?.coordinates) {
        const [lng, lat] = a.data.data.location.coordinates;
        setCitizenLocation({ lat, lng });
      }
    }).catch(() => toast.error('Failed to load alert'))
      .finally(() => setLoading(false));
  }, [id]);

  // GPS watch
  useEffect(() => {
    if (!navigator.geolocation) { setGpsStatus('error'); return; }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMyLocation({ lat: latitude, lng: longitude });
        setGpsStatus('active');
        emitLocationUpdate({ latitude, longitude, alertId: id });
      },
      () => setGpsStatus('denied'),
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current); };
  }, [id]);

  // Socket
  useEffect(() => {
    joinAlertRoom(id);
    const socket = getSocket();
    if (!socket) return;
    socket.on('LOCATION_UPDATE', (data) => {
      if (data.role === 'citizen') setCitizenLocation({ lat: data.latitude, lng: data.longitude });
    });
    socket.on('STATUS_UPDATE', ({ status }) => setAlert(prev => prev ? { ...prev, status } : prev));
    socket.on('NEW_MESSAGE', (msg) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    });
    socket.on('USER_TYPING', ({ name, isTyping: t }) => setIsTyping(t ? `${name} is typing...` : false));
    return () => {
      leaveAlertRoom(id);
      socket.off('LOCATION_UPDATE'); socket.off('STATUS_UPDATE');
      socket.off('NEW_MESSAGE');     socket.off('USER_TYPING');
    };
  }, [id]);

  const sendMessage = useCallback(() => {
    if (!newMsg.trim()) return;
    emitSendMessage({ alertId: id, message: newMsg.trim(), type: 'text' });
    setNewMsg(''); emitTyping(id, false);
  }, [newMsg, id]);

  const distKm = myLocation && citizenLocation ? (() => {
    const R = 6371;
    const dLat = ((citizenLocation.lat - myLocation.lat) * Math.PI) / 180;
    const dLon = ((citizenLocation.lng - myLocation.lng) * Math.PI) / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos((myLocation.lat*Math.PI)/180)*Math.cos((citizenLocation.lat*Math.PI)/180)*Math.sin(dLon/2)**2;
    return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
  })() : null;

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full" /></div>;
  if (!alert)  return <div className="text-center py-16 text-slate-500">Alert not found</div>;

  const mapCenter = myLocation ? [myLocation.lat, myLocation.lng]
    : citizenLocation ? [citizenLocation.lat, citizenLocation.lng]
    : [20.5937, 78.9629];

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="card bg-gradient-to-r from-green-600 to-green-700 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🤝</span>
              <h1 className="font-semibold text-base">Volunteer Assistance</h1>
            </div>
            <p className="text-green-200 text-xs capitalize">{alert.type?.replace('_',' ')} · {alert.severity}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${alert.status === 'RESOLVED' ? 'bg-green-500' : 'bg-white/20'}`}>
            {alert.status?.replace('_',' ')}
          </span>
        </div>
      </div>

      {/* GPS Status */}
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium ${gpsStatus === 'active' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-yellow-50 border border-yellow-200 text-yellow-800'}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${gpsStatus === 'active' ? 'bg-green-500 animate-pulse' : 'bg-yellow-400'}`} />
        {gpsStatus === 'active' ? '📍 Your location is being shared with the citizen' : '📡 Getting your GPS...'}
        {distKm && <span className="ml-auto font-semibold">🆘 {distKm} km from citizen</span>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {[['map','🗺️ Map'],['chat','💬 Chat'],['info','ℹ️ Info']].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab===t ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Map */}
      {tab === 'map' && (
        <div className="h-80 rounded-2xl overflow-hidden shadow-sm border border-slate-100">
          <MapContainer center={mapCenter} zoom={14} className="h-full w-full">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
            {myLocation && <AutoCenter lat={myLocation.lat} lng={myLocation.lng} />}

            {/* Volunteer location — green dot */}
            {myLocation && (
              <Marker position={[myLocation.lat, myLocation.lng]} icon={myIcon} zIndexOffset={1000}>
                <Popup><p style={{fontWeight:600,fontSize:'13px'}}>🤝 Your Location</p></Popup>
              </Marker>
            )}

            {/* Citizen / SOS location */}
            {citizenLocation && (
              <Marker position={[citizenLocation.lat, citizenLocation.lng]} icon={sosIcon}>
                <Popup>
                  <p style={{fontWeight:600,fontSize:'13px'}}>🆘 Citizen — {alert.citizenName}</p>
                  <p style={{fontSize:'12px',color:'#64748b'}}>{alert.address}</p>
                </Popup>
              </Marker>
            )}

            {/* Route between volunteer and citizen */}
            {myLocation && citizenLocation && (
              <Polyline
                positions={[[myLocation.lat, myLocation.lng],[citizenLocation.lat, citizenLocation.lng]]}
                color="#16a34a" weight={2} opacity={0.7} dashArray="8 5"
              />
            )}
          </MapContainer>
        </div>
      )}

      {/* Chat */}
      {tab === 'chat' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card">
          <div className="h-64 overflow-y-auto mb-3 space-y-3 pr-1">
            {messages.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <p className="text-3xl mb-2">💬</p>
                <p className="text-sm">Say hello to the citizen — let them know you are coming</p>
              </div>
            )}
            {messages.map((msg, i) => {
              const isOwn = msg.sender?._id === user?._id || msg.sender === user?._id;
              return (
                <div key={i} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs px-4 py-2.5 rounded-2xl text-sm ${isOwn ? 'bg-green-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'}`}>
                    {!isOwn && msg.senderName && <p className="text-xs font-semibold opacity-70 mb-1">{msg.senderName}</p>}
                    <p>{msg.message}</p>
                    <p className={`text-xs mt-1 text-right ${isOwn ? 'text-green-200' : 'opacity-50'}`}>
                      {new Date(msg.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                    </p>
                  </div>
                </div>
              );
            })}
            {isTyping && <p className="text-xs text-slate-400 italic">{isTyping}</p>}
            <div ref={chatEndRef} />
          </div>
          <div className="flex gap-2">
            <input value={newMsg} onChange={e => { setNewMsg(e.target.value); emitTyping(id, true); }}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              className="input-field text-sm" placeholder="Message citizen..." />
            <button onClick={sendMessage} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">→</button>
          </div>
        </motion.div>
      )}

      {/* Info */}
      {tab === 'info' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <div className="card">
            <h3 className="font-semibold text-slate-800 text-sm mb-3">🆘 Emergency Details</h3>
            <div className="space-y-2 text-sm">
              {[
                ['Type',        alert.type?.replace('_',' ')],
                ['Severity',    alert.severity],
                ['Status',      alert.status?.replace('_',' ')],
                ['Citizen',     alert.citizen?.name || alert.citizenName],
                ['Phone',       alert.citizen?.phone || alert.citizenPhone],
                ['Location',    alert.address],
                ['Alert ID',    alert.alertId],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="text-slate-500 min-w-20 text-xs">{k}</span>
                  <span className="font-medium text-slate-800 text-xs capitalize flex-1">{v || '—'}</span>
                </div>
              ))}
              {alert.citizen?.phone && (
                <a href={`tel:${alert.citizen.phone}`}
                  className="flex items-center gap-2 mt-3 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-100 w-fit">
                  📞 Call Citizen
                </a>
              )}
            </div>
          </div>
          {alert.customMessage && (
            <div className="card bg-yellow-50 border-yellow-100">
              <p className="font-semibold text-yellow-800 text-sm mb-1">💬 Citizen's Message</p>
              <p className="text-yellow-700 text-sm italic">"{alert.customMessage}"</p>
            </div>
          )}
          <div className="card bg-green-50 border-green-100">
            <p className="font-semibold text-green-800 text-sm mb-2">🤝 Volunteer Guidance</p>
            <div className="space-y-1 text-xs text-green-700">
              <p>• Call <b>112</b> immediately if professional help is needed</p>
              <p>• Share your ETA with the citizen using the chat</p>
              <p>• Do not move the victim unless absolutely necessary</p>
              <p>• Stay on the chat to coordinate with responders</p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
