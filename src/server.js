import app from './app.js';
import config from './config/index.js';
import { startScheduler } from './scheduler/index.js';

const PORT = config.port;

// start the express server
app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
    startScheduler();
    console.log('Weekly song planning job scheduled');
});
