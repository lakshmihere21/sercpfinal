import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    password: '', confirmPassword: '', role: 'citizen',
  });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone || !form.password) {
      return toast.error('All fields are required');
    }
    if (form.password !== form.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    if (form.password.length < 6) {
      return toast.error('Password must be at least 6 characters');
    }
    setLoading(true);
    try {
      const data = await register({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        role: form.role,
      });
      toast.success(`Welcome to SERCP, ${data.user.name}!`);
      navigate(`/${data.user.role}`, { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { value: 'citizen',   label: 'Citizen',   icon: '👤', desc: 'Get emergency help fast' },
    { value: 'volunteer', label: 'Volunteer',  icon: '🤝', desc: 'Help others nearby' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-lg bg-white rounded-2xl shadow-lg border border-slate-100 p-7"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">S</div>
          <div>
            <p className="font-semibold text-slate-800 text-sm">SERCP</p>
            <p className="text-xs text-slate-400">Emergency Response Platform</p>
          </div>
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-1">Create Account</h2>
        <p className="text-slate-500 text-xs mb-5">Free forever — no credit card needed</p>

        {/* Role selection */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {roles.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => set('role', r.value)}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                form.role === r.value
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-xl mb-1">{r.icon}</div>
              <p className="font-medium text-sm text-slate-800">{r.label}</p>
              <p className="text-xs text-slate-500">{r.desc}</p>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Name + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                className="input-field text-sm"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                className="input-field text-sm"
                placeholder="9876543210"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              className="input-field text-sm"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          {/* Password + Confirm */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  className="input-field text-sm pr-12"
                  placeholder="Min 6 chars"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs hover:text-slate-600"
                >
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Confirm Password</label>
              <input
                type={showPass ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={e => set('confirmPassword', e.target.value)}
                className="input-field text-sm"
                placeholder="Repeat password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-1"
          >
            {loading && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? 'Creating account...' : `Create ${form.role === 'citizen' ? 'Citizen' : 'Volunteer'} Account`}
          </button>
        </form>

        <div className="mt-4 text-center space-y-1">
          <p className="text-slate-600 text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 font-medium hover:underline">Sign in</Link>
          </p>
          <p>
            <Link to="/" className="text-slate-400 text-xs hover:text-slate-600">← Back to Home</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
