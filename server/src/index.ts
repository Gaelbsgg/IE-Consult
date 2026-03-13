import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import multer from 'multer';
import * as xlsx from 'xlsx';
import { SintegraScraper } from './scraper';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const upload = multer({ storage: multer.memoryStorage() });
const scraper = new SintegraScraper(io);

app.use(cors());
app.use(express.json());

app.post('/api/process', upload.single('file'), async (req, res) => {
  try {
    const { socketId, cpf, senha } = req.body;
    const file = req.file;

    if (!file || !socketId || !cpf || !senha) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Parse Spreadsheet
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json<any>(sheet);

    // Get CNPJs from the first column or column named 'CNPJ'
    const cnpjs = data.map(row => {
      const cnpj = row.CNPJ || row.cnpj || Object.values(row)[0];
      return String(cnpj).replace(/\D/g, '');
    }).filter(cnpj => cnpj.length === 14);

    if (cnpjs.length === 0) {
      return res.status(400).json({ error: 'No valid CNPJs found in spreadsheet' });
    }

    // Run Scraper in background
    scraper.run(socketId, cnpjs, cpf, senha).then(results => {
      // Create output spreadsheet
      const ws = xlsx.utils.json_to_sheet(results);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Resultados");
      
      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      io.to(socketId).emit('completed', {
        results,
        file: buffer.toString('base64')
      });
    });

    res.json({ message: 'Processing started', count: cnpjs.length });

  } catch (error: any) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
