import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { userAPI } from '../../services/api';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const SKILLS = ['first_aid','cpr','fire_rescue','search_rescue','medical_support','disaster_response','trauma_care'];

export default function VolunteerProfilePage() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    name:    user?.name    || '',
    phone:   user?.phone   || '',
    bloodGroup: user?.bloodGroup || '',
    customEmergencyMessage: user?.customEmergencyMessage || '',
    address: { city: user?.address?.city || '', state: user?.address?.state || '' },
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await userAPI.updateProfile(form);
      updateUser(res.data.data);
      toast.success('Profile updated!');
    } catch { toast.error('Update failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="card flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-green-600 text-white flex items-center justify-center text-2xl font-bold shadow-md">
          {user?.name?.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{user?.name}</h1>
          <p className="text-slate-500 text-sm">{user?.email}</p>
          <span className="inline-block mt-1 text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full font-medium">
            🤝 VOLUNTEER
          </span>
        </div>
      </motion.div>

      <div className="card">
        <h2 className="font-semibold text-slate-800 text-base mb-4">Personal Information</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Full Name</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="input-field" placeholder="Your name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Phone</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className="input-field" placeholder="9876543210" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">City</label>
              <input value={form.address.city} onChange={e => setForm(p => ({ ...p, address: { ...p.address, city: e.target.value } }))}
                className="input-field" placeholder="Mumbai" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Blood Group</label>
              <select value={form.bloodGroup} onChange={e => setForm(p => ({ ...p, bloodGroup: e.target.value }))}
                className="input-field">
                <option value="">Select</option>
                {['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Emergency Message</label>
            <textarea value={form.customEmergencyMessage}
              onChange={e => setForm(p => ({ ...p, customEmergencyMessage: e.target.value }))}
              className="input-field resize-none h-16 text-sm" placeholder="I am a volunteer and I am on my way to help." />
          </div>
          <button type="submit" disabled={saving}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? 'Saving...' : '💾 Save Changes'}
          </button>
        </form>
      </div>

      {/* Skills display */}
      <div className="card">
        <h3 className="font-semibold text-slate-800 text-sm mb-3">🛠️ Volunteer Skills</h3>
        <div className="flex flex-wrap gap-2">
          {SKILLS.map(skill => (
            <span key={skill} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full capitalize">
              {skill.replace(/_/g,' ')}
            </span>
          ))}
        </div>
        <p className="text-slate-400 text-xs mt-3">Skills are set during registration. Contact admin to update.</p>
      </div>

      <div className="card bg-slate-50">
        <h3 className="font-semibold text-slate-700 text-sm mb-3">Account Info</h3>
        <div className="space-y-2 text-sm">
          {[['Email', user?.email],['Role','Volunteer'],['Member Since', user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A']].map(([k,v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-slate-500 text-xs">{k}</span>
              <span className="font-medium text-slate-800 text-xs">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
