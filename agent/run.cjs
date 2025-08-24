// load .env from current working directory
require('dotenv').config();
// load the transpiled CommonJS bundle
require('./build/index.cjs');