import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import { LOGO_B64 } from '../constants';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err) {
      if (err.message.includes('Invalid login credentials')) {
        setError('Pogrešan email ili lozinka');
      } else if (err.message.includes('Email not confirmed')) {
        setError('Email nije verifikovan. Proverite inbox.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '20px'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 20,
        padding: 40,
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src={LOGO_B64} alt='Maropack' style={{ height: 60, objectFit: 'contain', marginBottom: 12 }} />
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>Dobrodošli</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Prijavite se na MAROPACK sistem</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
              Email adresa
            </label>
            <input
              type='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder='admin@maropack.rs'
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 10,
                border: '2px solid #e2e8f0',
                fontSize: 15,
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
              Lozinka
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder='••••••••'
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  paddingRight: '45px',
                  borderRadius: 10,
                  border: '2px solid #e2e8f0',
                  fontSize: 15,
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
              <button
                type='button'
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18,
                  padding: 4
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              marginBottom: 16,
              fontWeight: 600
            }}>
              ⚠️ {error}
            </div>
          )}

          <button
            type='submit'
            disabled={loading}
            style={{
              width: '100%',
              padding: 14,
              borderRadius: 10,
              border: 'none',
              background: loading ? '#94a3b8' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'transform 0.2s',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
            }}
            onMouseDown={(e) => !loading && (e.target.style.transform = 'scale(0.98)')}
            onMouseUp={(e) => e.target.style.transform = 'scale(1)'}
            onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
          >
            {loading ? '⏳ Prijavljivanje...' : '🔐 Prijavi se'}
          </button>
        </form>

        <div style={{ marginTop: 20, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
          Demo: admin@maropack.rs / Admin123!
        </div>
      </div>
    </div>
  );
}
