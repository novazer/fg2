const process = require('node:process');
const fs = require('node:fs');

process.on('uncaughtException', (err, origin) => {
  fs.writeSync(
    process.stderr.fd,
    `Caught exception: ${err}\n` +
    `Exception origin: ${origin}\n`,
  );
});


import App from '@/app';
import AuthRoute from '@routes/auth.route';
import IndexRoute from '@routes/index.route';
import UsersRoute from '@routes/users.route';
import DeviceRoute from '@routes/device.route';
import validateEnv from '@utils/validateEnv';
import MqttAuthRoute from './routes/mqttauth.route';
import DataRoute from './routes/data.route';

validateEnv();



const app = new App([new DataRoute(), new MqttAuthRoute(), new DeviceRoute(), new IndexRoute(), new UsersRoute(), new AuthRoute()]);
app.run();


