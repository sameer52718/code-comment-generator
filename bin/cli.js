#!/usr/bin/env node
const { program } = require('commander');
const { generateComments } = require('../src/index');

program
  .version('1.0.0')
  .description('Code Comment Generator CLI')
  .argument('<file>', 'JavaScript/TypeScript file to process')
  .option('-c, --config <path>', 'Path to configuration file', './code-comment-config.json')
  .action(async (file, options) => {
    try {
      await generateComments(file, options.config);
      console.log('Comments generated successfully!');
    } catch (error) {
      console.error('CLI Error:', error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);