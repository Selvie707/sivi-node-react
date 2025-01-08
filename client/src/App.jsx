import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000/'); // Ganti dengan URL backend

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [detections, setDetections] = useState([]);

  useEffect(() => {
    const startVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
      } catch (error) {
        console.error('Error accessing webcam:', error);
      }
    };
    startVideo();
  }, []);

  useEffect(() => {
    socket.on('modelOutput', (output) => {
      setDetections(output); 
      console.log('Detections received:', output);
    });
    return () => {
      socket.off('modelOutput');
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;

    const sendFrame = () => {
      if (video && canvas) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          socket.emit('videoFrame', blob); // Kirim frame sebagai Blob
        }, 'image/jpeg');
      }
    };

    const interval = setInterval(sendFrame, 200); // Kirim frame setiap 200ms (5 FPS)
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (detections.length > 0 && videoRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const video = videoRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      detections.forEach((det) => {
        const [x, y, width, height] = det.box;
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        // Tambahkan teks dengan latar belakang
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillRect(x, y - 20, ctx.measureText(det.classId.toString()).width + 10, 20); // Menampilkan ID Kelas
        ctx.fillStyle = 'white';
        ctx.fillText(det.classId.toString(), x + 5, y - 5); // Tampilkan ID kelas
      });
    }
  }, [detections]);

  return (
    <div>
      <h1>Real-Time Sign Language Detection</h1>
      <video ref={videoRef} autoPlay playsInline style={{ display: 'none' }}></video>
      <canvas ref={canvasRef} width="640" height="480" style={{ border: '1px solid black' }}></canvas>
      <div>
        <h2>Detected Gesture:</h2>
        <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
          {detections.length > 0 ? `Class ID: ${detections[0].classId}` : 'Waiting...'}
        </p>
      </div>
    </div>
  );
}

export default App;