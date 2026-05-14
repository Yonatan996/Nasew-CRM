import 'dotenv/config';
import { createApp } from './src/app.js';
import { connectMongo } from './src/db.js';
import { ensureSeedData } from './src/data/seedMongo.js';

const port = Number(process.env.PORT || 5000);

await connectMongo();
await ensureSeedData();

const app = createApp();

app.listen(port, () => {
  console.log(`Nasew CRM API is running on port ${port}`);
});
