// /workspaces/jobs/utils/logger.js
const chalk = require('chalk'); // Instale 'chalk' se quiser cores no console: npm install chalk

const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  let coloredMessage = message;

  switch (type) {
    case 'info':
      coloredMessage = chalk.blue(`[INFO] ${message}`);
      break;
    case 'success':
      coloredMessage = chalk.green(`[SUCCESS] ${message}`);
      break;
    case 'warn':
      coloredMessage = chalk.yellow(`[WARN] ${message}`);
      break;
    case 'error':
      coloredMessage = chalk.red(`[ERROR] ${message}`);
      break;
    default:
      coloredMessage = message;
  }
  console.log(`${timestamp} ${coloredMessage}`);
};

module.exports = { log };