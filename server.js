require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const net = require('net');

const app = express();
app.use(express.json());

// Render/Railway like platforms usually provide PORT automatically
const HTTP_PORT = Number(process.env.PORT || process.env.HTTP_PORT || 3000);
const TCP_PORT = Number(process.env.TCP_PORT || 9000);
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI is missing in .env or environment variables');
  process.exit(1);
}

// ===================== MONGODB MODEL =====================

const gpsPacketSchema = new mongoose.Schema(
  {
    busId: {
      type: String,
      default: 'bus1',
    },
    rawHex: {
      type: String,
      required: true,
    },
    sourceIp: {
      type: String,
      default: '',
    },
    sourcePort: {
      type: Number,
      default: 0,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

const GpsPacket = mongoose.model('GpsPacket', gpsPacketSchema);

// ===================== EXPRESS ROUTES =====================

app.get('/', (req, res) => {
  res.send('RUET GPS server is running');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'RUET GPS server is running',
    httpPort: HTTP_PORT,
    tcpPort: TCP_PORT,
  });
});

app.get('/latest', async (req, res) => {
  try {
    const latest = await GpsPacket.findOne().sort({ receivedAt: -1 });

    if (!latest) {
      return res.json({
        message: 'No GPS data yet',
      });
    }

    res.json(latest);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// ===================== TCP SERVER =====================

const tcpServer = net.createServer((socket) => {
  const clientIp = socket.remoteAddress || '';
  const clientPort = socket.remotePort || 0;

  console.log(`GPS connected: ${clientIp}:${clientPort}`);

  socket.on('data', async (data) => {
    try {
      const rawHex = data.toString('hex').toUpperCase();

      console.log('Received raw GPS packet:', rawHex);

      await GpsPacket.create({
        busId: 'bus1',
        rawHex,
        sourceIp: clientIp,
        sourcePort: clientPort,
      });

      console.log('Saved raw packet to MongoDB');
    } catch (error) {
      console.error('Error saving GPS packet:', error.message);
    }
  });

  socket.on('end', () => {
    console.log(`GPS disconnected: ${clientIp}:${clientPort}`);
  });

  socket.on('error', (error) => {
    console.error(`Socket error from ${clientIp}:${clientPort}:`, error.message);
  });
});

// ===================== START SERVERS =====================

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected');

    // HTTP server for Render/browser/API
    app.listen(HTTP_PORT, '0.0.0.0', () => {
      console.log(`HTTP API running on port ${HTTP_PORT}`);
    });

    // TCP server for GPS listener
    // This may not work on Render Web Service for real GT06 TCP traffic,
    // but it stays here for your full backend code.
    tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
      console.log(`TCP GPS listener running on port ${TCP_PORT}`);
    });
  } catch (error) {
    console.error('Server startup error:', error.message);
    process.exit(1);
  }
}

startServer();