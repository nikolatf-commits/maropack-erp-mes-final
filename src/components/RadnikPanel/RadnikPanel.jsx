import React, { useState } from 'react';
import RadnikLogin from './RadnikLogin';
import RadnikDashboard from './RadnikDashboard';

/**
 * 👤 RADNIK PANEL - GLAVNI WRAPPER
 * 
 * Flow:
 * 1. Login → QR ili ime
 * 2. Dashboard → lista naloga
 * 3. Nalog detalji → faze, timer, zastoji
 */
export default function RadnikPanel() {
    const [radnik, setRadnik] = useState(null);

    // Logout funkcija
    const handleLogout = () => {
        if (window.confirm('Da li sigurno želiš da se izloguješ?')) {
            setRadnik(null);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f766e 0%, #134e4a 100%)',
            padding: '20px'
        }}>
            {!radnik ? (
                <RadnikLogin onLogin={setRadnik} />
            ) : (
                <RadnikDashboard radnik={radnik} onLogout={handleLogout} />
            )}
        </div>
    );
}
