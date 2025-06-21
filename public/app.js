// app.js

document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const appSection = document.getElementById('app-section');
    const loginForm = document.getElementById('login-form');
    const transferForm = document.getElementById('transfer-form');
    const logArea = document.getElementById('log-area');

    let ws;
    let userProfile = {};

    function log(message) {
        logArea.innerHTML += `[${new Date().toLocaleTimeString()}] ${message}\n`;
        logArea.scrollTop = logArea.scrollHeight;
    }

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const kelas = document.getElementById('kelas').value.toUpperCase();
        const kelompok = document.getElementById('kelompok').value.toUpperCase();
        const nrps = document.getElementById('nrps').value.split(',').map(n => n.trim());
        const ewallet = document.getElementById('ewallet').value;

        userProfile = { kelas, kelompok, ewallet };

        // Ganti URL jika server berjalan di tempat lain
        ws = new WebSocket('ws://localhost:3000/ws');

        ws.onopen = () => {
            log('Connected to server via WebSocket.');
            const loginPayload = {
                type: 'login',
                payload: { kelas, kelompok, nrps, ewallet }
            };
            ws.send(JSON.stringify(loginPayload));
            log('Sending login credentials...');
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            log(`Received: ${JSON.stringify(data)}`);
            
            handleServerMessage(data);
        };

        ws.onclose = () => {
            log('Disconnected from server.');
            loginSection.classList.remove('hidden');
            appSection.classList.add('hidden');
        };

        ws.onerror = (error) => {
            log(`WebSocket Error: ${error}`);
        };
    });

    transferForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const targetClass = document.getElementById('target-class').value.toUpperCase();
        const targetGroup = document.getElementById('target-group').value.toUpperCase();
        const amount = document.getElementById('transfer-amount').value;

        const transferPayload = {
            type: 'transfer',
            payload: {
                targetClass,
                targetGroup,
                amount,
                ewallet: userProfile.ewallet
            }
        };
        ws.send(JSON.stringify(transferPayload));
        log(`Sending transfer command to ${targetClass}/${targetGroup} for ${amount}...`);
    });

    function handleServerMessage(data) {
        switch (data.type) {
            case 'login_success':
                loginSection.classList.add('hidden');
                appSection.classList.remove('hidden');
                updateProfileUI(data.payload.userProfile);
                break;
            case 'login_failed':
                alert(`Login Gagal: ${data.message}`);
                ws.close();
                break;
            case 'mqtt_message':
                // Ini adalah bagian penting untuk update live
                // Anda perlu membuat logika untuk membedakan pesan (transfer, update saldo, dll)
                // berdasarkan topic-nya.
                log(`[MQTT] Topic: ${data.payload.topic}`);
                log(`[MQTT] Message: ${JSON.stringify(data.payload.message)}`);
                
                // Contoh: Jika ada notifikasi transfer masuk
                if (data.payload.topic.includes('/transfer/notification')) {
                    const msg = data.payload.message;
                    alert(`Transfer Diterima! Sejumlah ${msg.amount} dari ${msg.sender_ewallet}`);
                }
                
                // Contoh: Jika ada update saldo
                if (data.payload.topic.includes('/balance/update')) {
                    const newBalance = data.payload.message.balance;
                    document.getElementById('profile-balance').textContent = `Rp ${newBalance.toLocaleString('id-ID')}`;
                }
                break;
            case 'error':
                log(`Server Error: ${data.message}`);
                break;
        }
    }
    
    function updateProfileUI(profile) {
        document.getElementById('profile-kelas').textContent = profile.kelas;
        document.getElementById('profile-kelompok').textContent = profile.kelompok;
        document.getElementById('profile-ewallet').textContent = profile.ewallet;
    }
});