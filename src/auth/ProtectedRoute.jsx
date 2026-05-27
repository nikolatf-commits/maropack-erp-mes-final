import React from 'react';
import { useAuth } from './AuthProvider';

export default function ProtectedRoute({ children, requireAdmin = false, requireManager = false }) {
  const { user, userProfile, loading, isAdmin, isManager } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 50,
            height: 50,
            border: '4px solid #e2e8f0',
            borderTopColor: '#667eea',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: '#64748b' }}>Učitavanje...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc'
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 16,
          padding: 40,
          textAlign: 'center',
          maxWidth: 400,
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Pristup odbijen</h2>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            Nemate administrator privilegije za pristup ovoj stranici.
          </p>
        </div>
      </div>
    );
  }

  if (requireManager && !isManager) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc'
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 16,
          padding: 40,
          textAlign: 'center',
          maxWidth: 400,
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Pristup odbijen</h2>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            Nemate manager privilegije za pristup ovoj stranici.
          </p>
        </div>
      </div>
    );
  }

  return children;
}