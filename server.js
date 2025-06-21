// server.js

const express = require('express');
const http = require('http');
const path = require('path');
const mqtt = require('mqtt');
const expressWs = require('express-ws');

// --- Inisialisasi Server ---
const app = express();
const server = http.createServer(app);
const wss = expressWs(app, server);

const PORT = 3000;

// --- Konfigurasi Broker ---
const MQTT_BROKER_URL = 'mqtt://147.182.226.225:1883';

// --- Middleware untuk menyajikan file statis dari folder 'public' ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper untuk membuat kredensial ---
// NOTE: Fungsi ini harus Anda sesuaikan dengan logika NRP kelompok Anda!
function generateCredentials(kelas, kelompok, nrps) {
    // Contoh untuk Kelompok G Kelas A
    // nrps = ["5027231002", "5027231004", "5027231008"];
    const sumNrp = nrps.reduce((acc, curr) => acc + parseInt(curr.slice(-3)), 0);
    const paddedSum = String(sumNrp).padStart(3, '0'); // Hasil: "014"

    return {
        email: `insys-${kelas}-${kelompok}@bankit.com`,
        username: `Kelompok_${kelompok}_Kelas_${kelas}`,
        password: `Insys#${kelas}${kelompok}#${paddedSum}`,
        baseTopic: `${kelas}/${kelompok}`
    };
}

// --- Logika WebSocket ---
app.ws('/ws', (ws, req) => {
    console.log('Client connected via WebSocket');
    ws.mqttClient = null; // Akan diisi setelah login

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received from client:', data);

            switch (data.type) {
                case 'login':
                    handleLogin(ws, data.payload);
                    break;
                case 'transfer':
                    handleTransfer(ws, data.payload);
                    break;
                // TODO: Tambahkan case untuk 'buyProduct', 'getHistory', dll.
                // case 'buyProduct':
                //     handleBuy(ws, data.payload);
                //     break;
            }
        } catch (error) {
            console.error('Failed to parse message or invalid message format:', error);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (ws.mqttClient && ws.mqttClient.connected) {
            ws.mqttClient.end();
            console.log('MQTT client disconnected');
        }
    });
});

function handleLogin(ws, payload) {
    const { kelas, kelompok, nrps, ewallet } = payload;
    
    // Validasi input sederhana
    if (!kelas || !kelompok || !nrps || !ewallet) {
        ws.send(JSON.stringify({ type: 'login_failed', message: 'Data tidak lengkap' }));
        return;
    }

    // Hasilkan kredensial berdasarkan data kelompok
    const creds = generateCredentials(kelas, kelompok, nrps);
    
    const options = {
        username: creds.username,
        password: creds.password,
        clientId: `ws_client_${kelas}_${kelompok}_${Date.now()}`
    };

    console.log(`Connecting to MQTT Broker with username: ${creds.username}`);
    const client = mqtt.connect(MQTT_BROKER_URL, options);
    ws.mqttClient = client; // Simpan client MQTT di koneksi WebSocket

    client.on('connect', () => {
        console.log(`MQTT client for Kelompok ${kelompok} Kelas ${kelas} connected!`);
        
        // Kirim pesan sukses login ke frontend
        ws.send(JSON.stringify({
            type: 'login_success',
            payload: {
                message: `Login berhasil sebagai Kelompok ${kelompok} Kelas ${kelas}`,
                userProfile: { kelas, kelompok, ewallet },
                creds: creds // Kirim info untuk debugging (opsional)
            }
        }));

        // Subscribe ke semua topic di bawah base topic kelompok
        const topicToSubscribe = `${creds.baseTopic}/#`;
        client.subscribe(topicToSubscribe, (err) => {
            if (!err) {
                console.log(`Subscribed to topic: ${topicToSubscribe}`);
            } else {
                console.error('Subscription failed:', err);
            }
        });
    });

    client.on('message', (topic, message) => {
        // Ketika ada pesan masuk dari broker MQTT, teruskan ke frontend
        console.log(`Received MQTT message on topic ${topic}: ${message.toString()}`);
        ws.send(JSON.stringify({
            type: 'mqtt_message',
            payload: {
                topic: topic,
                message: JSON.parse(message.toString()) // Asumsi pesan adalah JSON
            }
        }));
    });

    client.on('error', (err) => {
        console.error('MQTT connection error:', err);
        ws.send(JSON.stringify({ type: 'login_failed', message: 'Koneksi MQTT Gagal. Cek kredensial.' }));
        client.end();
    });
}

function handleTransfer(ws, payload) {
    if (!ws.mqttClient || !ws.mqttClient.connected) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not logged in' }));
        return;
    }

    const { targetClass, targetGroup, amount, ewallet } = payload;
    
    // **PENTING**: Topic dan payload harus disesuaikan dengan dokumentasi Postman
    // Ini hanyalah contoh!
    const topic = `${targetClass}/${targetGroup}/bankit/transfer/request`;
    const message = JSON.stringify({
        amount: parseInt(amount, 10),
        sender_ewallet: ewallet // ewallet pengirim
    });

    console.log(`Publishing to ${topic}: ${message}`);
    ws.mqttClient.publish(topic, message, (err) => {
        if (err) {
            console.error('Publish error:', err);
            ws.send(JSON.stringify({ type: 'transfer_failed', message: 'Gagal mengirim transfer' }));
        } else {
            // Konfirmasi pengiriman ke frontend (bukan konfirmasi transfer berhasil)
            ws.send(JSON.stringify({ type: 'transfer_sent', message: 'Perintah transfer telah dikirim' }));
        }
    });
}


// --- Mulai Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});