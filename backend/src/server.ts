import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { initScheduler } from './utils/scheduler';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);

  // Start background scheduler for automated debt collection
  initScheduler();
});
