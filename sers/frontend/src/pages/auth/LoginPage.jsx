import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error('Please enter your email and password');
      return;
    }
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      toast.success(`Welcome back, ${data.user.name}!`);
      // Redirect based on role but no restriction if they visit other routes
      navigate(`/${data.user.role}`, { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Check your email and password.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex">

      {/* Left panel - decorative */}
      <div className="hidden lg:flex flex-1 bg-blue-700 items-center justify-center p-12">
        <div className="max-w-sm text-white">
          <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center text-2xl font-bold mb-8 shadow-lg">S</div>
          <h1 className="text-2xl font-bold mb-3">Back to the frontline.</h1>
          <p className="text-blue-200 text-sm leading-relaxed mb-8">
            Log in to access real-time emergency management, live tracking, and dispatch tools.
          </p>
          <div className="space-y-3">
            {[
              ['🚨', 'Real-time SOS alerts'],
              ['📍', 'Live GPS tracking'],
              ['🚑', 'Smart dispatch'],
              ['📊', 'Analytics dashboard'],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-3 text-blue-100 text-sm">
                <span>{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">S</div>
            <span className="font-semibold text-slate-800 text-sm">SERCP</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Sign In</h2>
          <p className="text-slate-500 text-sm mb-8">Enter your credentials to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="input-field"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="input-field pr-12"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-slate-600 text-sm">
              Don't have an account?{' '}
              <Link to="/register" className="text-blue-600 font-medium hover:underline">
                Register free
              </Link>
            </p>
            <p>
              <Link to="/" className="text-slate-400 text-xs hover:text-slate-600">
                ← Back to Home
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default LoginPage;
