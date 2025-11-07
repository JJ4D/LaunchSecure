import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import clientsRouter from './api/clients';
import healthRouter from './api/health';
import scansRouter from './api/scans';
import findingsRouter from './api/findings';
import authRouter from './api/auth';
import reportsRouter from './api/reports';
import verificationRouter from './api/verification';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.use('/api/health', healthRouter);

// API routes
app.use('/api/auth', authRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/scans', scansRouter);
app.use('/api/findings', findingsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/verification', verificationRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`Orchestrator API running on port ${PORT}`);
});

