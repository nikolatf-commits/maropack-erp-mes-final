import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth/AuthProvider';

export default function UserManagement() {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    ime: '',
    uloga: 'radnik',
    aktivan: true
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error loading users:', err);
      setError('Greška pri učitavanju korisnika');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddUser(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      if (supabase.__demo) {
        setError('Demo mode - ne možeš kreirati prave korisnike. Postavi pravu Supabase bazu.');
        return;
      }

      setSuccess(`Korisnik će biti dodat. U production-u: 
        1. Idi u Supabase Dashboard → Authentication → Add user
        2. Email: ${formData.email}
        3. Password: ${formData.password}
        4. Auto Confirm: YES
        5. User profil će se auto-kreirati pri prvom login-u`);
      
      setShowAddModal(false);
      resetForm();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdateUser(userId) {
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('users')
        .update({
          ime: formData.ime,
          uloga: formData.uloga,
          aktivan: formData.aktivan
        })
        .eq('id', userId);

      if (error) throw error;

      setSuccess('Korisnik uspešno ažuriran!');
      setEditingUser(null);
      resetForm();
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleActive(userId, currentStatus) {
    try {
      const { error } = await supabase
        .from('users')
        .update({ aktivan: !currentStatus })
        .eq('id', userId);

      if (error) throw error;

      setSuccess(currentStatus ? 'Korisnik deaktiviran' : 'Korisnik aktiviran');
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  function resetForm() {
    setFormData({
      email: '',
      password: '',
      ime: '',
      uloga: 'radnik',
      aktivan: true
    });
  }

  function openEditModal(user) {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      ime: user.ime,
      uloga: user.uloga,
      aktivan: user.aktivan
    });
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#64748b' }}>Učitavanje korisnika...</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>👥 Upravljanje korisnicima</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            {users.length} {users.length === 1 ? 'korisnik' : users.length < 5 ? 'korisnika' : 'korisnika'}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
          }}
        >
          ➕ Dodaj korisnika
        </button>
      </div>

      {error && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #fecaca',
          color: '#dc2626',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 600
        }}>
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div style={{
          background: '#dcfce7',
          border: '1px solid #bbf7d0',
          color: '#166534',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: 'pre-line'
        }}>
          ✅ {success}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Korisnik</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Email</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Uloga</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Status</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Kreiran</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Akcije</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>👤</div>
                  <div>Nema korisnika</div>
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600 }}>{user.ime}</div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 12 }}>
                    {user.email}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      background: user.uloga === 'admin' ? '#dbeafe' : user.uloga === 'manager' ? '#fef3c7' : '#f1f5f9',
                      color: user.uloga === 'admin' ? '#1e40af' : user.uloga === 'manager' ? '#92400e' : '#475569',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontWeight: 700,
                      fontSize: 11,
                      textTransform: 'uppercase'
                    }}>
                      {user.uloga}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      background: user.aktivan ? '#dcfce7' : '#fee2e2',
                      color: user.aktivan ? '#166534' : '#991b1b',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontWeight: 700,
                      fontSize: 11
                    }}>
                      {user.aktivan ? '✓ Aktivan' : '✕ Neaktivan'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 12 }}>
                    {new Date(user.created_at).toLocaleDateString('sr-RS')}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        onClick={() => openEditModal(user)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid #e2e8f0',
                          background: '#fff',
                          fontSize: 12,
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        ✏️ Izmeni
                      </button>
                      {user.id !== userProfile?.id && (
                        <button
                          onClick={() => handleToggleActive(user.id, user.aktivan)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            background: user.aktivan ? '#fee2e2' : '#dcfce7',
                            fontSize: 12,
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          {user.aktivan ? '🔒 Deaktiviraj' : '🔓 Aktiviraj'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: 32,
            width: '100%',
            maxWidth: 500,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800 }}>➕ Dodaj novog korisnika</h3>
            
            <form onSubmit={handleAddUser}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Privremena lozinka
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Ime i prezime
                </label>
                <input
                  type="text"
                  value={formData.ime}
                  onChange={(e) => setFormData({ ...formData, ime: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Uloga
                </label>
                <select
                  value={formData.uloga}
                  onChange={(e) => setFormData({ ...formData, uloga: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 14,
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="radnik">Radnik</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                    setError('');
                  }}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Otkaži
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 8,
                    border: 'none',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Dodaj korisnika
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: 32,
            width: '100%',
            maxWidth: 500,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800 }}>✏️ Izmeni korisnika</h3>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                Email (ne može se menjati)
              </label>
              <input
                type="email"
                value={formData.email}
                disabled
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 14,
                  background: '#f8fafc',
                  color: '#94a3b8',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                Ime i prezime
              </label>
              <input
                type="text"
                value={formData.ime}
                onChange={(e) => setFormData({ ...formData, ime: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 14,
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                Uloga
              </label>
              <select
                value={formData.uloga}
                onChange={(e) => setFormData({ ...formData, uloga: e.target.value })}
                disabled={editingUser.id === userProfile?.id}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 14,
                  background: editingUser.id === userProfile?.id ? '#f8fafc' : '#fff',
                  boxSizing: 'border-box'
                }}
              >
                <option value="radnik">Radnik</option>
                <option value="manager">Manager</option>
                <option value="admin">Administrator</option>
              </select>
              {editingUser.id === userProfile?.id && (
                <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>
                  Ne možeš promeniti svoju ulogu
                </p>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.aktivan}
                  onChange={(e) => setFormData({ ...formData, aktivan: e.target.checked })}
                  disabled={editingUser.id === userProfile?.id}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Aktivan nalog
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  setEditingUser(null);
                  resetForm();
                  setError('');
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Otkaži
              </button>
              <button
                onClick={() => handleUpdateUser(editingUser.id)}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Sačuvaj izmene
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}