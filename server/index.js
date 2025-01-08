import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import * as ort from 'onnxruntime-node';
import { createCanvas, Image } from 'canvas';
import cors from 'cors';
import util from 'util';

const app = express();

// Setup CORS
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Muat model ONNX
let session;
(async () => {
  try {
    session = await ort.InferenceSession.create('D:\\node_react\\server\\model\\besty.onnx');
    console.log('Model ONNX berhasil dimuat');
  } catch (err) {
    console.error('Gagal memuat model ONNX:', err);
  }
})();

// Route utama
app.get('/', (req, res) => {
  res.send('Hello, this is the backend!');
});

// Preprocessing: Resize dan normalize gambar
function preprocess(image) {
  const targetWidth = 640;
  const targetHeight = 640;

  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');

  // Resize dengan padding (letterbox)
  const ratio = Math.min(targetWidth / image.width, targetHeight / image.height);
  const newWidth = Math.round(image.width * ratio);
  const newHeight = Math.round(image.height * ratio);
  const dx = (targetWidth - newWidth) / 2;
  const dy = (targetHeight - newHeight) / 2;

  ctx.fillStyle = '#727272'; // Warna padding
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image, dx, dy, newWidth, newHeight);

  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const floatData = new Float32Array(targetWidth * targetHeight * 3);

  for (let i = 0; i < targetWidth * targetHeight; i++) {
    floatData[i * 3] = imageData.data[i * 4] / 255.0; // R
    floatData[i * 3 + 1] = imageData.data[i * 4 + 1] / 255.0; // G
    floatData[i * 3 + 2] = imageData.data[i * 4 + 2] / 255.0; // B
  }

  return new ort.Tensor('float32', floatData, [1, 3, targetHeight, targetWidth]);
}

// Postprocessing: Filter hasil dan rescale bounding box
function postprocess(results, width, height) {
  const outputKey = Object.keys(results)[0]; // Ambil key pertama dari hasil model
  console.log('Model Output Key:', outputKey);

  const detections = results[outputKey]?.cpuData; // Ambil data dari key tersebut
  if (!detections) {
    throw new Error('Output tensor tidak ditemukan atau tidak valid.');
  }

  const threshold = 0.5;
  const filteredDetections = [];

  for (let i = 0; i < detections.length; i += 6) {
    const [x1, y1, x2, y2, score, classId] = detections.slice(i, i + 6);
    if (score > threshold) {
      filteredDetections.push({
        classId: Math.round(classId),
        confidence: score,
        box: {
          x1: x1 * width,
          y1: y1 * height,
          x2: x2 * width,
          y2: y2 * height,
        },
      });
    }
  }
  return filteredDetections;
}

// Proses frame dan jalankan inferensi
async function processFrame(frameData) {
  const image = new Image();

  return new Promise((resolve, reject) => {
    image.onload = async () => {
      try {
        const inputTensor = preprocess(image);
        const results = await session.run({ images: inputTensor }); // Sesuaikan nama input
        const detections = postprocess(results, image.width, image.height);
        resolve(detections);
      } catch (err) {
        reject(`Error during inference: ${err}`);
      }
    };

    image.onerror = (err) => reject('Error loading image: ' + err);
    image.src = Buffer.from(frameData, 'base64');
  });
}

// WebSocket untuk menerima stream video
io.on('connection', (socket) => {
  console.log('User connected');

  socket.on('videoFrame', async (frame) => {
    try {
      const detections = await processFrame(frame);
      socket.emit('modelOutput', detections);
    } catch (err) {
      console.error('Error processing frame:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Jalankan server
const port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});