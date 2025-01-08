import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import * as ort from 'onnxruntime-node';
import { createCanvas, Image } from 'canvas'; // Untuk memproses frame video menjadi tensor

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Muat model ONNX
let session;
(async () => {
  try {
    session = await ort.InferenceSession.create('D:\\node_react\\server\\model\\besty.onnx'); // Path ke model ONNX
    console.log('Model ONNX berhasil dimuat');
  } catch (err) {
    console.error('Gagal memuat model ONNX:', err);
  }
})();

// Route untuk halaman root ("/")
app.get('/', (req, res) => {
  res.send('Hello, this is the backend!');
});

// Fungsi untuk memproses frame dan menjalankan model ONNX
async function processFrame(frameData) {
  const image = new Image();
  
  return new Promise((resolve, reject) => {
    image.onload = async () => {
      console.log('Image loaded successfully');

      // Buat canvas untuk memproses gambar
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, image.width, image.height);
      const imageData = ctx.getImageData(0, 0, image.width, image.height);

      // Konversi image ke tensor dengan format [1, 3, H, W]
      const inputTensor = preprocess(imageData);
      console.log('Image processed into tensor');

      // Jalankan model ONNX
      const feeds = { input: inputTensor }; // Ganti "input" dengan nama input tensor modelmu
      const results = await session.run(feeds);

      // Postprocessing hasil deteksi
      const detections = postprocess(results);
      resolve(detections);
    };

    image.onerror = (err) => reject('Error loading image: ' + err);

    // Konversi frame menjadi image
    image.src = Buffer.from(frameData, 'base64');
  });
}

// Preprocessing: Konversi imageData menjadi tensor
function preprocess(imageData) {
  const { data, width, height } = imageData;
  const floatData = new Float32Array(width * height * 3); // Format YOLO input

  for (let i = 0; i < width * height; i++) {
    floatData[i * 3] = data[i * 4] / 255.0;       // R
    floatData[i * 3 + 1] = data[i * 4 + 1] / 255.0; // G
    floatData[i * 3 + 2] = data[i * 4 + 2] / 255.0; // B
  }

  return new ort.Tensor('float32', floatData, [1, 3, height, width]);
}

// Postprocessing: Ambil hasil deteksi
function postprocess(results) {
  const boxes = results['boxes'].data; // Ganti dengan nama output ONNX-mu
  const scores = results['scores'].data; // Confidence
  const classes = results['classes'].data; // Kelas

  const threshold = 0.5; // Confidence threshold
  const detections = [];

  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > threshold) {
      detections.push({
        class: classes[i],
        confidence: scores[i],
        box: boxes.slice(i * 4, i * 4 + 4), // Bounding box
      });
    }
  }

  return detections;
}

// Setup WebSocket untuk menerima video stream
io.on('connection', (socket) => {
  console.log('User connected');

  socket.on('videoFrame', async (frame) => {
    try {
      const result = await processFrame(frame); // Proses frame
      console.log('Detection result:', result);
      socket.emit('modelOutput', result); // Kirim hasil ke frontend
    } catch (err) {
      console.error('Error processing frame:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Tentukan port dan mulai server
const port = process.env.PORT || 5000;
server.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
